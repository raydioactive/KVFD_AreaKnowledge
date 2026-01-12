import { useState, useEffect, useCallback, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';
import { useStationStore } from '../../store/stationStore';

type QuizType = 'beat_identification' | 'facility_location' | 'protocol_destination' | 'turn_by_turn';

interface QuizQuestion {
  id: string;
  type: QuizType;
  prompt: string;
  correctAnswer: string;
  options?: string[];
  targetLocation?: [number, number];  // [lng, lat]
  hints?: string[];
}

interface QuizSession {
  type: QuizType;
  questions: QuizQuestion[];
  currentIndex: number;
  score: number;
  totalScore: number;
  startTime: number;
  answers: { questionId: string; answer: string; correct: boolean; timeMs: number; distance?: number }[];
}

interface QuizPanelProps {
  map: maplibregl.Map | null;
  isOpen: boolean;
  onClose: () => void;
}

// Quiz type configurations
const QUIZ_CONFIGS: Record<QuizType, { name: string; description: string; icon: string }> = {
  beat_identification: {
    name: 'Beat Identification',
    description: 'Identify the fire box/beat for a given location',
    icon: '🗺️',
  },
  facility_location: {
    name: 'Facility Location',
    description: 'Locate hospitals, stations, and nursing homes on the map',
    icon: '📍',
  },
  protocol_destination: {
    name: 'Protocol Destination',
    description: 'Select the correct destination based on patient condition',
    icon: '🚑',
  },
  turn_by_turn: {
    name: 'Turn-by-Turn',
    description: 'Follow route directions to reach a destination',
    icon: '🧭',
  },
};

// Calculate distance between two points in km
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

// Check if a point is inside a polygon (ray casting algorithm)
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const x = point[0], y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Check if a facility point is within any of the given fire boxes
function isPointInFireBoxes(point: [number, number], fireBoxes: any[]): boolean {
  for (const box of fireBoxes) {
    if (box.geometry.type === 'Polygon') {
      if (pointInPolygon(point, box.geometry.coordinates[0])) {
        return true;
      }
    } else if (box.geometry.type === 'MultiPolygon') {
      for (const polygon of box.geometry.coordinates) {
        if (pointInPolygon(point, polygon[0])) {
          return true;
        }
      }
    }
  }
  return false;
}

// Calculate score based on distance (GeoGuessr-style)
function calculateScore(distanceKm: number): number {
  // Max score 5000, decreases with distance
  // Within 0.5km = 5000, 1km = 4500, 5km = 2500, 10km = 500, >20km = 0
  if (distanceKm <= 0.1) return 5000;
  if (distanceKm <= 0.5) return Math.round(5000 - (distanceKm * 1000));
  if (distanceKm <= 1) return Math.round(4500 - ((distanceKm - 0.5) * 2000));
  if (distanceKm <= 5) return Math.round(3500 - ((distanceKm - 1) * 500));
  if (distanceKm <= 10) return Math.round(1500 - ((distanceKm - 5) * 200));
  if (distanceKm <= 20) return Math.round(500 - ((distanceKm - 10) * 50));
  return 0;
}

function QuizPanel({ map, isOpen, onClose }: QuizPanelProps) {
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType | null>(null);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [guessLocation, setGuessLocation] = useState<[number, number] | null>(null);
  const [showResult, setShowResult] = useState<boolean>(false);
  const [lastScore, setLastScore] = useState<number>(0);
  const [lastDistance, setLastDistance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Refs for map markers
  const guessMarkerRef = useRef<maplibregl.Marker | null>(null);
  const targetMarkerRef = useRef<maplibregl.Marker | null>(null);

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
      if (map.getLayer('quiz-result-line')) map.removeLayer('quiz-result-line');
      if (map.getSource('quiz-result-line')) map.removeSource('quiz-result-line');
    }
  }, [map]);

  // Generate questions for facility location quiz
  const generateFacilityQuestions = useCallback(async (): Promise<QuizQuestion[]> => {
    const questions: QuizQuestion[] = [];
    const stationPattern = useStationStore.getState().getFirstDueBoxPattern();

    try {
      // Fetch all data including fire boxes if station is selected
      const requests: Promise<any>[] = [
        apiClient.get('/api/facilities/hospitals'),
        apiClient.get('/api/facilities/stations'),
      ];

      // If station is selected, fetch fire boxes for filtering
      if (stationPattern) {
        requests.push(apiClient.get('/api/gis/fire-boxes'));
      }

      const responses = await Promise.all(requests);
      let hospitals = responses[0].data.features;
      let stations = responses[1].data.features;

      // Filter facilities by station's first-due area if station is selected
      if (stationPattern && responses[2]) {
        const allFireBoxes = responses[2].data.features || [];
        // Get fire boxes for this station
        const firstDueBoxes = allFireBoxes.filter((box: any) =>
          box.properties.BEAT?.startsWith(stationPattern)
        );

        if (firstDueBoxes.length > 0) {
          console.log(`Filtering facilities for station pattern ${stationPattern} (${firstDueBoxes.length} first-due boxes)`);

          // Filter hospitals that are within first-due boxes
          const filteredHospitals = hospitals.filter((h: any) =>
            isPointInFireBoxes(h.geometry.coordinates, firstDueBoxes)
          );

          // Filter stations that are within first-due boxes
          const filteredStations = stations.filter((s: any) =>
            isPointInFireBoxes(s.geometry.coordinates, firstDueBoxes)
          );

          // Use filtered lists if we have enough facilities, otherwise fall back to all
          if (filteredHospitals.length >= 2 || filteredStations.length >= 2) {
            hospitals = filteredHospitals.length >= 2 ? filteredHospitals : hospitals;
            stations = filteredStations.length >= 2 ? filteredStations : stations;
            console.log(`Using filtered: ${filteredHospitals.length} hospitals, ${filteredStations.length} stations`);
          } else {
            console.log('Not enough facilities in first-due area, using all facilities');
          }
        }
      }

      // Generate hospital questions
      const shuffledHospitals = [...hospitals].sort(() => Math.random() - 0.5).slice(0, 5);
      for (const hospital of shuffledHospitals) {
        questions.push({
          id: `hospital-${hospital.properties.id}`,
          type: 'facility_location',
          prompt: `Find: ${hospital.properties.name}`,
          correctAnswer: hospital.properties.name,
          targetLocation: hospital.geometry.coordinates,
          hints: [hospital.properties.city, hospital.properties.address],
        });
      }

      // Generate station questions
      const shuffledStations = [...stations].sort(() => Math.random() - 0.5).slice(0, 5);
      for (const station of shuffledStations) {
        questions.push({
          id: `station-${station.properties.station_number}`,
          type: 'facility_location',
          prompt: `Find: Station ${station.properties.station_number} - ${station.properties.station_name}`,
          correctAnswer: station.properties.station_number,
          targetLocation: station.geometry.coordinates,
          hints: [station.properties.city, station.properties.station_type],
        });
      }

      return questions.sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('Error generating facility questions:', error);
      return [];
    }
  }, []);

  // Generate protocol destination questions
  const generateProtocolQuestions = useCallback(async (): Promise<QuizQuestion[]> => {
    const questions: QuizQuestion[] = [];

    try {
      const hospitalsRes = await apiClient.get('/api/facilities/hospitals');
      const hospitals = hospitalsRes.data.features;

      const stemiHospitals = hospitals.filter((h: any) => h.properties.is_stemi_center);
      const strokeHospitals = hospitals.filter((h: any) => h.properties.is_stroke_center);
      const traumaHospitals = hospitals.filter((h: any) => h.properties.is_trauma_center);
      const pediatricHospitals = hospitals.filter((h: any) => h.properties.is_pediatric_center);

      if (stemiHospitals.length > 0) {
        questions.push({
          id: 'protocol-stemi-1',
          type: 'protocol_destination',
          prompt: '🫀 STEMI Alert: 62yo male, chest pain, ST elevation in V1-V4. Select destination:',
          correctAnswer: stemiHospitals.map((h: any) => h.properties.name).join('|'),
          options: [...stemiHospitals.slice(0, 2).map((h: any) => h.properties.name),
                   ...hospitals.filter((h: any) => !h.properties.is_stemi_center).slice(0, 2).map((h: any) => h.properties.name)]
                   .sort(() => Math.random() - 0.5),
        });
      }

      if (strokeHospitals.length > 0) {
        questions.push({
          id: 'protocol-stroke-1',
          type: 'protocol_destination',
          prompt: '🧠 Stroke Alert: 55yo female, sudden onset left-sided weakness, last known well 45 min ago. Select destination:',
          correctAnswer: strokeHospitals.map((h: any) => h.properties.name).join('|'),
          options: [...strokeHospitals.slice(0, 2).map((h: any) => h.properties.name),
                   ...hospitals.filter((h: any) => !h.properties.is_stroke_center).slice(0, 2).map((h: any) => h.properties.name)]
                   .sort(() => Math.random() - 0.5),
        });
      }

      if (traumaHospitals.length > 0) {
        questions.push({
          id: 'protocol-trauma-1',
          type: 'protocol_destination',
          prompt: '🚨 Trauma Alert: MVC, unrestrained driver, significant vehicle damage, GCS 12. Select destination:',
          correctAnswer: traumaHospitals.map((h: any) => h.properties.name).join('|'),
          options: [...traumaHospitals.map((h: any) => h.properties.name),
                   ...hospitals.filter((h: any) => !h.properties.is_trauma_center).slice(0, 2).map((h: any) => h.properties.name)]
                   .sort(() => Math.random() - 0.5),
        });
      }

      if (pediatricHospitals.length > 0) {
        questions.push({
          id: 'protocol-peds-1',
          type: 'protocol_destination',
          prompt: '👶 Pediatric Emergency: 3yo with respiratory distress, SpO2 88%, retractions. Select destination:',
          correctAnswer: pediatricHospitals.map((h: any) => h.properties.name).join('|'),
          options: [...pediatricHospitals.map((h: any) => h.properties.name),
                   ...hospitals.filter((h: any) => !h.properties.is_pediatric_center).slice(0, 3).map((h: any) => h.properties.name)]
                   .sort(() => Math.random() - 0.5),
        });
      }

      return questions.sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('Error generating protocol questions:', error);
      return [];
    }
  }, []);

  // Start a quiz session
  const startQuiz = useCallback(async (quizType: QuizType) => {
    setLoading(true);
    clearMarkers();

    let questions: QuizQuestion[] = [];

    switch (quizType) {
      case 'facility_location':
        questions = await generateFacilityQuestions();
        break;
      case 'protocol_destination':
        questions = await generateProtocolQuestions();
        break;
      case 'beat_identification':
        questions = [{
          id: 'beat-demo-1',
          type: 'beat_identification',
          prompt: 'Beat identification quiz coming soon!',
          correctAnswer: 'demo',
        }];
        break;
      case 'turn_by_turn':
        questions = [{
          id: 'turn-demo-1',
          type: 'turn_by_turn',
          prompt: 'Turn-by-turn quiz coming soon!',
          correctAnswer: 'demo',
        }];
        break;
    }

    setSession({
      type: quizType,
      questions,
      currentIndex: 0,
      score: 0,
      totalScore: 0,
      startTime: Date.now(),
      answers: [],
    });

    setGuessLocation(null);
    setShowResult(false);
    setLoading(false);
  }, [generateFacilityQuestions, generateProtocolQuestions, clearMarkers]);

  // Submit guess for location quiz
  const submitGuess = useCallback(() => {
    if (!session || !guessLocation || !map) return;

    const currentQuestion = session.questions[session.currentIndex];
    if (!currentQuestion.targetLocation) return;

    const [guessLng, guessLat] = guessLocation;
    const [targetLng, targetLat] = currentQuestion.targetLocation;

    // Calculate distance and score
    const distance = calculateDistance(guessLat, guessLng, targetLat, targetLng);
    const score = calculateScore(distance);

    setLastDistance(distance);
    setLastScore(score);
    setShowResult(true);

    // Show target marker
    const targetEl = document.createElement('div');
    targetEl.className = 'target-marker';
    targetEl.innerHTML = `
      <div style="
        width: 40px;
        height: 40px;
        background: #22c55e;
        border: 4px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      ">✓</div>
    `;

    targetMarkerRef.current = new maplibregl.Marker({ element: targetEl })
      .setLngLat([targetLng, targetLat])
      .addTo(map);

    // Draw line between guess and target
    if (map.isStyleLoaded()) {
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
          'line-color': score > 2500 ? '#22c55e' : score > 1000 ? '#f59e0b' : '#ef4444',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });
    }

    // Fit map to show both points
    const bounds = new maplibregl.LngLatBounds()
      .extend(guessLocation)
      .extend([targetLng, targetLat]);

    map.fitBounds(bounds, { padding: 100, maxZoom: 14 });

    // Update session
    setSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        score: prev.score + (distance <= 1 ? 1 : 0), // Binary correct for summary
        totalScore: prev.totalScore + score,
        answers: [...prev.answers, {
          questionId: currentQuestion.id,
          answer: `${guessLat.toFixed(4)}, ${guessLng.toFixed(4)}`,
          correct: distance <= 1,
          timeMs: Date.now() - prev.startTime,
          distance,
        }],
      };
    });
  }, [session, guessLocation, map]);

  // Check answer for protocol quiz
  const checkProtocolAnswer = useCallback((answer: string) => {
    if (!session) return;

    const currentQuestion = session.questions[session.currentIndex];
    const correctAnswers = currentQuestion.correctAnswer.split('|');
    const correct = correctAnswers.some(ca => ca.toLowerCase() === answer.toLowerCase());

    setLastScore(correct ? 5000 : 0);
    setShowResult(true);

    setSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        score: correct ? prev.score + 1 : prev.score,
        totalScore: prev.totalScore + (correct ? 5000 : 0),
        answers: [...prev.answers, {
          questionId: currentQuestion.id,
          answer,
          correct,
          timeMs: Date.now() - prev.startTime,
        }],
      };
    });
  }, [session]);

  // Move to next question
  const nextQuestion = useCallback(() => {
    clearMarkers();
    setShowResult(false);
    setGuessLocation(null);

    setSession(prev => {
      if (!prev) return null;
      return {
        ...prev,
        currentIndex: prev.currentIndex + 1,
      };
    });
  }, [clearMarkers]);

  // End quiz
  const endQuiz = useCallback(() => {
    clearMarkers();
    setSession(null);
    setSelectedQuizType(null);
    setShowResult(false);
    setGuessLocation(null);
  }, [clearMarkers]);

  // Handle map click for location quiz - place guess marker
  useEffect(() => {
    if (!map || !session || session.type !== 'facility_location' || showResult) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setGuessLocation(lngLat);

      // Remove old guess marker
      if (guessMarkerRef.current) {
        guessMarkerRef.current.remove();
      }

      // Create guess marker
      const el = document.createElement('div');
      el.className = 'guess-marker';
      el.innerHTML = `
        <div style="
          width: 36px;
          height: 36px;
          background: #3b82f6;
          border: 4px solid white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          animation: pulse 1s infinite;
        ">
          <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
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
  }, [map, session, showResult]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      clearMarkers();
    }
  }, [isOpen, clearMarkers]);

  if (!isOpen) return null;

  // Get selected station info for display
  const { selectedStation, getStationDisplayNumber } = useStationStore();
  const stationDisplayNumber = getStationDisplayNumber();

  // Quiz selection screen
  if (!selectedQuizType && !session) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Select Quiz Mode</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
          </div>

          {/* Show selected station info */}
          {selectedStation && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold text-red-700">Station {stationDisplayNumber}</span>
                <span className="text-red-600 text-sm">- {selectedStation.station_name}</span>
              </div>
              <p className="text-xs text-red-600 mt-1">Quiz questions will focus on your station's first-due area</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {(Object.entries(QUIZ_CONFIGS) as [QuizType, typeof QUIZ_CONFIGS[QuizType]][]).map(([type, config]) => (
              <button
                key={type}
                onClick={() => { setSelectedQuizType(type); startQuiz(type); }}
                className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
              >
                <div className="text-3xl mb-2">{config.icon}</div>
                <h3 className="font-semibold text-gray-800">{config.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{config.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <p className="text-lg text-blue-600">Loading quiz questions...</p>
        </div>
      </div>
    );
  }

  // Quiz complete
  if (session && session.currentIndex >= session.questions.length) {
    const avgScore = Math.round(session.totalScore / session.questions.length);
    const percentage = Math.round((avgScore / 5000) * 100);

    return (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-5xl mb-4">
            {percentage >= 80 ? '🏆' : percentage >= 60 ? '🎯' : percentage >= 40 ? '👍' : '📚'}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Quiz Complete!</h2>

          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-6 my-4">
            <p className="text-sm opacity-80">Total Score</p>
            <p className="text-4xl font-bold">{session.totalScore.toLocaleString()}</p>
            <p className="text-sm opacity-80 mt-2">out of {(session.questions.length * 5000).toLocaleString()} possible</p>
          </div>

          <p className="text-gray-600 mb-6">
            Average: {avgScore.toLocaleString()} points per question
          </p>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => { endQuiz(); setSelectedQuizType(session.type); startQuiz(session.type); }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Play Again
            </button>
            <button
              onClick={endQuiz}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active quiz question
  if (session) {
    const currentQuestion = session.questions[session.currentIndex];
    const isLocationQuiz = session.type === 'facility_location';
    const progress = ((session.currentIndex + 1) / session.questions.length) * 100;

    return (
      <>
        {/* Top bar with question */}
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-gray-200">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="p-4">
              {/* Question header */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-500">
                  Question {session.currentIndex + 1} of {session.questions.length}
                </span>
                <span className="text-sm font-bold text-purple-600">
                  {session.totalScore.toLocaleString()} pts
                </span>
              </div>

              {/* Question prompt */}
              <h3 className="text-lg font-bold text-gray-800">{currentQuestion.prompt}</h3>

              {/* Hints for location quiz */}
              {isLocationQuiz && currentQuestion.hints && !showResult && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {currentQuestion.hints.map((hint, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                      {hint}
                    </span>
                  ))}
                </div>
              )}

              {/* Protocol quiz options */}
              {currentQuestion.options && !showResult && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => checkProtocolAnswer(option)}
                      className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left text-sm font-medium transition-all"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom action bar for location quiz */}
        {isLocationQuiz && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-lg px-4">
            <div className="bg-white rounded-xl shadow-2xl p-4">
              {!showResult ? (
                <>
                  {guessLocation ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Your guess is placed</p>
                        <p className="text-xs text-gray-400">Drag marker to adjust</p>
                      </div>
                      <button
                        onClick={submitGuess}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-bold hover:from-blue-600 hover:to-purple-700 transition-all"
                      >
                        Submit Guess
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-gray-600 font-medium">Click on the map to place your guess</p>
                      <p className="text-sm text-gray-400 mt-1">Find the location described above</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center">
                  {/* Result display */}
                  <div className={`inline-block px-4 py-2 rounded-full mb-3 ${
                    lastScore >= 4000 ? 'bg-green-100 text-green-700' :
                    lastScore >= 2500 ? 'bg-yellow-100 text-yellow-700' :
                    lastScore >= 1000 ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    <span className="font-bold text-lg">+{lastScore.toLocaleString()}</span>
                    <span className="text-sm ml-2">
                      ({lastDistance < 1 ? `${Math.round(lastDistance * 1000)}m` : `${lastDistance.toFixed(1)}km`} away)
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                      <span>Your guess</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                      <span>Correct location</span>
                    </div>
                  </div>

                  <button
                    onClick={nextQuestion}
                    className="mt-4 px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-bold hover:from-blue-600 hover:to-purple-700 transition-all"
                  >
                    {session.currentIndex + 1 >= session.questions.length ? 'See Results' : 'Next Question'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Protocol quiz result */}
        {!isLocationQuiz && showResult && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-lg px-4">
            <div className="bg-white rounded-xl shadow-2xl p-4 text-center">
              <div className={`inline-block px-4 py-2 rounded-full mb-3 ${
                lastScore > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                <span className="font-bold text-lg">{lastScore > 0 ? '✓ Correct!' : '✗ Incorrect'}</span>
              </div>

              {lastScore === 0 && (
                <p className="text-sm text-gray-600 mb-3">
                  Correct answer: {currentQuestion.correctAnswer.split('|')[0]}
                </p>
              )}

              <button
                onClick={nextQuestion}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-bold"
              >
                {session.currentIndex + 1 >= session.questions.length ? 'See Results' : 'Next Question'}
              </button>
            </div>
          </div>
        )}

        {/* End quiz button */}
        <button
          onClick={endQuiz}
          className="absolute top-20 right-4 z-40 px-4 py-2 bg-white rounded-lg shadow-lg text-gray-600 hover:text-gray-800"
        >
          End Quiz
        </button>

        {/* CSS for marker animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        `}</style>
      </>
    );
  }

  return null;
}

export default QuizPanel;
