import { useState, useEffect, useCallback, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';
import { useStationStore } from '../../store/stationStore';

interface AddressQuestion {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  full_address: string;
  location: [number, number];  // [lng, lat]
  facility_type: string;
  facility_name: string;
  difficulty: string;
  beat?: string;  // Fire box ID if available
}

interface AddressQuizProps {
  map: maplibregl.Map | null;
  isOpen: boolean;
  onClose: () => void;
}

// Calculate distance between two points in km (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate score based on distance - STEEP curve requiring near-perfect accuracy
function calculateScore(distanceKm: number): number {
  // Steep scoring: need to be very close to get points
  // Within 25m = 5000 (perfect)
  // Within 50m = 4000
  // Within 100m = 2500
  // Within 200m = 1000
  // Within 300m = 250
  // Beyond 300m = 0
  const distanceM = distanceKm * 1000;

  if (distanceM <= 25) return 5000;
  if (distanceM <= 50) return Math.round(5000 - (distanceM - 25) * 40);  // 5000 -> 4000
  if (distanceM <= 100) return Math.round(4000 - (distanceM - 50) * 30); // 4000 -> 2500
  if (distanceM <= 200) return Math.round(2500 - (distanceM - 100) * 15); // 2500 -> 1000
  if (distanceM <= 300) return Math.round(1000 - (distanceM - 200) * 7.5); // 1000 -> 250
  if (distanceM <= 500) return Math.round(250 - (distanceM - 300) * 1.25); // 250 -> 0
  return 0;
}

// Format distance for display
function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
}

function AddressQuiz({ map, isOpen, onClose }: AddressQuizProps) {
  const [questions, setQuestions] = useState<AddressQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [guessLocation, setGuessLocation] = useState<[number, number] | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [lastDistance, setLastDistance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);

  // Quiz settings
  const [showSetup, setShowSetup] = useState(true);
  const [questionCount, setQuestionCount] = useState(10);
  const [endlessMode, setEndlessMode] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Refs for map markers
  const guessMarkerRef = useRef<maplibregl.Marker | null>(null);
  const targetMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Station store
  const { getFirstDueBoxPattern, selectedStation, getStationDisplayNumber } = useStationStore();

  // Store the initial bounds for resetting view
  const initialBoundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  const stationPattern = getFirstDueBoxPattern();

  // Reset map view to station's fire box area
  const resetMapView = useCallback(() => {
    if (!map || !initialBoundsRef.current) return;

    map.fitBounds(initialBoundsRef.current, {
      padding: 50,
      maxZoom: 14,
      duration: 500
    });
  }, [map]);

  // Calculate and store initial bounds from fire box data
  const calculateInitialBounds = useCallback(async () => {
    if (!map || !stationPattern) return;

    try {
      const response = await apiClient.get('/api/gis/fire-boxes');
      const fireBoxes = response.data.features || [];

      // Filter to station's fire boxes
      const stationBoxes = fireBoxes.filter((box: any) =>
        box.properties?.BEAT?.startsWith(stationPattern)
      );

      if (stationBoxes.length > 0) {
        const bounds = new maplibregl.LngLatBounds();

        for (const box of stationBoxes) {
          if (box.geometry.type === 'Polygon') {
            box.geometry.coordinates[0].forEach((coord: [number, number]) => {
              bounds.extend(coord);
            });
          } else if (box.geometry.type === 'MultiPolygon') {
            box.geometry.coordinates.forEach((polygon: any) => {
              polygon[0].forEach((coord: [number, number]) => {
                bounds.extend(coord);
              });
            });
          }
        }

        initialBoundsRef.current = bounds;
        resetMapView();
      }
    } catch (error) {
      console.error('Error calculating bounds:', error);
    }
  }, [map, stationPattern, resetMapView]);

  // Clean up markers
  const clearMarkers = useCallback(() => {
    if (guessMarkerRef.current) {
      guessMarkerRef.current.remove();
      guessMarkerRef.current = null;
    }
    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }
    // Remove result line if exists
    if (map) {
      try {
        if (map.getLayer('quiz-result-line')) map.removeLayer('quiz-result-line');
        if (map.getSource('quiz-result-line')) map.removeSource('quiz-result-line');
      } catch (e) {
        // Ignore errors
      }
    }
  }, [map]);

  // Load questions function
  const loadQuestions = useCallback(async (count: number, append: boolean = false) => {
    setLoading(true);
    try {
      // Calculate bounds if not already done
      if (!initialBoundsRef.current) {
        await calculateInitialBounds();
      }

      const params = new URLSearchParams();
      if (stationPattern) {
        params.append('station_pattern', stationPattern);
      }
      // Request more than needed to ensure randomness
      params.append('count', String(Math.max(count, 50)));

      const response = await apiClient.get(`/api/quiz/address-questions?${params}`);
      const data = response.data;

      if (data.questions && data.questions.length > 0) {
        // Shuffle on client side too for extra randomness
        const shuffled = [...data.questions].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, count);

        if (append) {
          setQuestions(prev => [...prev, ...selected]);
        } else {
          setQuestions(selected);
          setCurrentIndex(0);
          setTotalScore(0);
          setQuestionsAnswered(0);
          setGameComplete(false);
          setShowResult(false);
          setGuessLocation(null);
        }
      } else {
        console.warn('No address questions available');
      }
    } catch (error) {
      console.error('Error loading address questions:', error);
    } finally {
      setLoading(false);
    }
  }, [stationPattern, calculateInitialBounds]);

  // Start quiz with settings
  const startQuiz = useCallback(async (count: number, endless: boolean) => {
    setShowSetup(false);
    setEndlessMode(endless);
    setQuestionCount(count);
    await loadQuestions(endless ? 20 : count);
    resetMapView();
  }, [loadQuestions, resetMapView]);

  // Reset to setup when quiz opens
  useEffect(() => {
    if (isOpen) {
      setShowSetup(true);
      calculateInitialBounds();
    }
  }, [isOpen, calculateInitialBounds]);

  // Handle map click for placing guess
  useEffect(() => {
    if (!map || !isOpen || showResult || questions.length === 0 || gameComplete) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setGuessLocation(lngLat);

      // Remove old guess marker
      if (guessMarkerRef.current) {
        guessMarkerRef.current.remove();
      }

      // Create guess marker (blue pin)
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          animation: pulse 1.5s infinite;
        ">
          <div style="width: 10px; height: 10px; background: white; border-radius: 50%;"></div>
        </div>
      `;

      guessMarkerRef.current = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(lngLat)
        .addTo(map);

      // Update location when marker is dragged
      guessMarkerRef.current.on('dragend', () => {
        const pos = guessMarkerRef.current?.getLngLat();
        if (pos) {
          setGuessLocation([pos.lng, pos.lat]);
        }
      });
    };

    map.on('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';

    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [map, isOpen, showResult, questions, gameComplete]);

  // Submit guess
  const submitGuess = useCallback(() => {
    if (!guessLocation || !map || questions.length === 0) return;

    const currentQuestion = questions[currentIndex];
    const [guessLng, guessLat] = guessLocation;
    const [targetLng, targetLat] = currentQuestion.location;

    // Calculate distance and score
    const distance = calculateDistance(guessLat, guessLng, targetLat, targetLng);
    const score = calculateScore(distance);

    setLastDistance(distance);
    setLastScore(score);
    setTotalScore(prev => prev + score);
    setShowResult(true);

    // Show target marker (green checkmark)
    const targetEl = document.createElement('div');
    targetEl.innerHTML = `
      <div style="
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        border: 4px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        color: white;
      ">✓</div>
    `;

    targetMarkerRef.current = new maplibregl.Marker({ element: targetEl })
      .setLngLat([targetLng, targetLat])
      .addTo(map);

    // Draw line between guess and target
    if (map.isStyleLoaded()) {
      try {
        map.addSource('quiz-result-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [guessLocation, [targetLng, targetLat]]
            }
          }
        });

        map.addLayer({
          id: 'quiz-result-line',
          type: 'line',
          source: 'quiz-result-line',
          paint: {
            'line-color': score >= 3000 ? '#22c55e' : score >= 1500 ? '#f59e0b' : '#ef4444',
            'line-width': 4,
            'line-dasharray': [2, 2]
          }
        });
      } catch (e) {
        console.warn('Error adding result line:', e);
      }
    }

    // Fit map to show both points
    const bounds = new maplibregl.LngLatBounds()
      .extend(guessLocation)
      .extend([targetLng, targetLat]);

    map.fitBounds(bounds, { padding: 100, maxZoom: 15 });
  }, [guessLocation, map, questions, currentIndex]);

  // Next question
  const nextQuestion = useCallback(async () => {
    clearMarkers();
    setShowResult(false);
    setGuessLocation(null);
    setQuestionsAnswered(prev => prev + 1);

    if (endlessMode) {
      // In endless mode, load more questions if running low
      if (currentIndex + 1 >= questions.length - 5) {
        await loadQuestions(20, true);
      }
      setCurrentIndex(prev => prev + 1);
      resetMapView();
    } else {
      if (currentIndex + 1 >= questions.length) {
        setGameComplete(true);
      } else {
        setCurrentIndex(prev => prev + 1);
        resetMapView();
      }
    }
  }, [currentIndex, questions.length, clearMarkers, resetMapView, endlessMode, loadQuestions]);

  // Restart quiz
  const restartQuiz = useCallback(() => {
    clearMarkers();
    setShowSetup(true);
    setCurrentIndex(0);
    setTotalScore(0);
    setQuestionsAnswered(0);
    setGameComplete(false);
    setShowResult(false);
    setGuessLocation(null);
  }, [clearMarkers]);

  // End endless mode
  const endEndlessMode = useCallback(() => {
    setGameComplete(true);
  }, []);

  // Close quiz
  const handleClose = useCallback(() => {
    clearMarkers();
    onClose();
  }, [clearMarkers, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMarkers();
    };
  }, [clearMarkers]);

  if (!isOpen) return null;

  // Loading state
  if (loading) {
    return (
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-white rounded-xl shadow-2xl px-8 py-4">
          <p className="text-blue-600 font-medium">Loading address quiz...</p>
        </div>
      </div>
    );
  }

  // Setup screen - select quiz options
  if (showSetup) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">📍</div>
            <h2 className="text-2xl font-bold text-gray-800">Address Quiz</h2>
            {selectedStation && (
              <p className="text-gray-500 mt-1">
                Station {getStationDisplayNumber()} - {selectedStation.station_name}
              </p>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Number of Questions
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 20, 50].map((count) => (
                <button
                  key={count}
                  onClick={() => setQuestionCount(count)}
                  className={`py-3 rounded-lg font-bold transition-all ${
                    questionCount === count && !endlessMode
                      ? 'bg-blue-600 text-white shadow-lg scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <button
              onClick={() => setEndlessMode(!endlessMode)}
              className={`w-full py-4 rounded-lg font-bold transition-all flex items-center justify-center gap-3 ${
                endlessMode
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-xl">∞</span>
              <span>Endless Mode</span>
            </button>
            {endlessMode && (
              <p className="text-sm text-gray-500 text-center mt-2">
                Play until you're done. Final score is normalized per question.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => startQuiz(questionCount, endlessMode)}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-bold hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
            >
              Start Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No questions available (after starting)
  if (questions.length === 0) {
    return (
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md">
          <h3 className="text-lg font-bold text-gray-800 mb-2">No Addresses Available</h3>
          <p className="text-gray-600 text-sm mb-4">
            {stationPattern
              ? `No addresses found in Station ${getStationDisplayNumber()}'s first-due area.`
              : 'Select a station to load address questions.'}
          </p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Game complete
  if (gameComplete) {
    // For endless mode, use questionsAnswered; for fixed mode use questions.length
    const questionsCompleted = endlessMode ? questionsAnswered : questions.length;
    const maxPossible = questionsCompleted * 5000;
    const avgScore = questionsCompleted > 0 ? Math.round(totalScore / questionsCompleted) : 0;
    const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">
            {percentage >= 80 ? '🏆' : percentage >= 60 ? '🎯' : percentage >= 40 ? '👍' : '📚'}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {endlessMode ? 'Endless Mode Complete!' : 'Quiz Complete!'}
          </h2>

          {selectedStation && (
            <p className="text-gray-600 mb-4">
              Station {getStationDisplayNumber()} - {selectedStation.station_name}
            </p>
          )}

          {endlessMode ? (
            <>
              {/* Endless mode: show average score prominently */}
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl p-6 my-4">
                <p className="text-sm opacity-80">Average Score per Question</p>
                <p className="text-4xl font-bold">{avgScore.toLocaleString()}</p>
                <p className="text-sm opacity-80 mt-2">out of 5,000 possible</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Questions answered:</span>
                  <span className="font-bold text-gray-800">{questionsCompleted}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-600">Total score:</span>
                  <span className="font-bold text-gray-800">{totalScore.toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Fixed mode: show total score */}
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-6 my-4">
                <p className="text-sm opacity-80">Total Score</p>
                <p className="text-4xl font-bold">{totalScore.toLocaleString()}</p>
                <p className="text-sm opacity-80 mt-2">out of {maxPossible.toLocaleString()} possible</p>
              </div>
            </>
          )}

          <p className="text-gray-600 mb-6">
            {percentage >= 80 ? 'Excellent! You know your area!' :
             percentage >= 60 ? 'Good job! Keep practicing!' :
             percentage >= 40 ? 'Not bad! Room for improvement.' :
             'Keep studying the area!'}
          </p>

          <div className="flex gap-4 justify-center">
            <button
              onClick={restartQuiz}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-bold hover:from-blue-600 hover:to-purple-700"
            >
              Play Again
            </button>
            <button
              onClick={handleClose}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = endlessMode ? 0 : ((currentIndex + 1) / questions.length) * 100;
  const currentQuestionNum = endlessMode ? questionsAnswered + 1 : currentIndex + 1;
  const avgScoreDisplay = questionsAnswered > 0 ? Math.round(totalScore / questionsAnswered) : 0;

  return (
    <>
      {/* Top Banner - Compact Address Bar */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Progress */}
          <div className="flex items-center gap-3 text-sm">
            {endlessMode ? (
              <>
                <span className="text-purple-400">∞</span>
                <span className="text-gray-400">Q: {currentQuestionNum}</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">{currentIndex + 1}/{questions.length}</span>
                <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Center: Address */}
          <div className="flex-1 text-center px-4">
            <span className="font-bold">{currentQuestion.address}</span>
            <span className="text-gray-400 ml-2">{currentQuestion.city}, {currentQuestion.state}</span>
          </div>

          {/* Right: Score & Controls */}
          <div className="flex items-center gap-4 text-sm">
            {endlessMode ? (
              <>
                <span className="text-purple-400 font-bold">Avg: {avgScoreDisplay}</span>
                <button
                  onClick={endEndlessMode}
                  className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium transition-colors"
                >
                  End Quiz
                </button>
              </>
            ) : (
              <span className="text-blue-400 font-bold">{totalScore.toLocaleString()} pts</span>
            )}
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Action Panel - Top Left */}
      <div className="absolute top-12 left-4 z-40">
        <div className="bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
          {!showResult ? (
            guessLocation ? (
              <div className="flex items-center gap-3">
                <span className="text-gray-600">Guess placed</span>
                <button
                  onClick={submitGuess}
                  className="px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
                >
                  Submit
                </button>
              </div>
            ) : (
              <span className="text-gray-500">Click map to guess</span>
            )
          ) : (
            <div className="flex items-center gap-3">
              <span className={`font-bold ${
                lastScore >= 4000 ? 'text-green-600' :
                lastScore >= 2500 ? 'text-yellow-600' :
                lastScore >= 1000 ? 'text-orange-600' :
                'text-red-600'
              }`}>
                +{lastScore.toLocaleString()} ({formatDistance(lastDistance)})
              </span>
              <button
                onClick={nextQuestion}
                className="px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
              >
                {currentIndex + 1 >= questions.length ? 'Results' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 4px 20px rgba(59, 130, 246, 0.6); }
        }
      `}</style>
    </>
  );
}

export default AddressQuiz;
