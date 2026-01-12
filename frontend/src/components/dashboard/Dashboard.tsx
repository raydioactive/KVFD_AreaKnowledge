import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FacilitySummary {
  hospitals: {
    total: number;
    trauma: number;
    stemi: number;
    stroke: number;
  };
  stations: {
    total: number;
    career: number;
    volunteer: number;
    combination: number;
  };
  nursingHomes: {
    total: number;
    totalBeds: number;
  };
}

interface QuizStats {
  totalSessions: number;
  averageScore: number;
  bestScore: number;
  totalQuestions: number;
  byType: Record<string, { sessions: number; avgScore: number }>;
}

function Dashboard({ isOpen, onClose }: DashboardProps) {
  const [facilitySummary, setFacilitySummary] = useState<FacilitySummary | null>(null);
  const [quizStats, setQuizStats] = useState<QuizStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'facilities' | 'progress'>('overview');

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch facility summaries
        const [hospitalsRes, stationsRes, nursingHomesRes] = await Promise.all([
          apiClient.get('/api/facilities/hospitals/capabilities'),
          apiClient.get('/api/facilities/stations/summary'),
          apiClient.get('/api/facilities/nursing-homes/summary'),
        ]);

        setFacilitySummary({
          hospitals: {
            total: hospitalsRes.data.total_hospitals,
            trauma: hospitalsRes.data.trauma_centers.total,
            stemi: hospitalsRes.data.stemi_centers,
            stroke: hospitalsRes.data.stroke_centers.total,
          },
          stations: {
            total: stationsRes.data.total_stations,
            career: stationsRes.data.by_type.career,
            volunteer: stationsRes.data.by_type.volunteer,
            combination: stationsRes.data.by_type.combination,
          },
          nursingHomes: {
            total: nursingHomesRes.data.total_facilities,
            totalBeds: nursingHomesRes.data.total_beds,
          },
        });

        // Quiz stats would come from backend when implemented
        // For now, use localStorage for demo
        const savedStats = localStorage.getItem('quizStats');
        if (savedStats) {
          setQuizStats(JSON.parse(savedStats));
        } else {
          setQuizStats({
            totalSessions: 0,
            averageScore: 0,
            bestScore: 0,
            totalQuestions: 0,
            byType: {},
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Training Dashboard</h2>
              <p className="text-blue-200 text-sm mt-1">Montgomery County EMS Trainer</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-blue-200 text-2xl font-light"
            >
              &times;
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6">
            {(['overview', 'facilities', 'progress'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-white text-blue-600'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">Loading dashboard data...</p>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      title="Hospitals"
                      value={facilitySummary?.hospitals.total || 0}
                      icon="🏥"
                      color="blue"
                    />
                    <StatCard
                      title="Fire Stations"
                      value={facilitySummary?.stations.total || 0}
                      icon="🚒"
                      color="red"
                    />
                    <StatCard
                      title="Nursing Homes"
                      value={facilitySummary?.nursingHomes.total || 0}
                      icon="🏘️"
                      color="purple"
                    />
                    <StatCard
                      title="Quiz Sessions"
                      value={quizStats?.totalSessions || 0}
                      icon="📝"
                      color="green"
                    />
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Getting Started</h3>
                    <div className="space-y-3">
                      <ChecklistItem
                        done={true}
                        text="Map tiles loaded - offline capability ready"
                      />
                      <ChecklistItem
                        done={true}
                        text={`${facilitySummary?.hospitals.total || 0} hospitals loaded with capabilities`}
                      />
                      <ChecklistItem
                        done={true}
                        text={`${facilitySummary?.stations.total || 0} fire stations loaded`}
                      />
                      <ChecklistItem
                        done={(quizStats?.totalSessions || 0) > 0}
                        text="Complete your first quiz session"
                      />
                      <ChecklistItem
                        done={(quizStats?.averageScore || 0) >= 80}
                        text="Achieve 80% average score"
                      />
                    </div>
                  </div>

                  {/* Training Tips */}
                  <div className="bg-blue-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-blue-800 mb-3">Training Tips</h3>
                    <ul className="space-y-2 text-sm text-blue-700">
                      <li>• Use <strong>Training Mode</strong> (no street labels) to test your geographic knowledge</li>
                      <li>• Practice with <strong>Protocol Destination</strong> quizzes to memorize STEMI/Stroke/Trauma destinations</li>
                      <li>• Toggle facility layers to study hospital and station locations</li>
                      <li>• Use the routing tool to practice navigating between locations</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Facilities Tab */}
              {activeTab === 'facilities' && facilitySummary && (
                <div className="space-y-6">
                  {/* Hospitals */}
                  <div className="bg-white border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="text-2xl">🏥</span> Hospitals
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <MiniStat label="Total" value={facilitySummary.hospitals.total} />
                      <MiniStat label="Trauma Centers" value={facilitySummary.hospitals.trauma} color="red" />
                      <MiniStat label="STEMI Centers" value={facilitySummary.hospitals.stemi} color="orange" />
                      <MiniStat label="Stroke Centers" value={facilitySummary.hospitals.stroke} color="purple" />
                    </div>
                  </div>

                  {/* Fire Stations */}
                  <div className="bg-white border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="text-2xl">🚒</span> Fire Stations
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <MiniStat label="Total" value={facilitySummary.stations.total} />
                      <MiniStat label="Career" value={facilitySummary.stations.career} color="red" />
                      <MiniStat label="Volunteer" value={facilitySummary.stations.volunteer} color="yellow" />
                      <MiniStat label="Combination" value={facilitySummary.stations.combination} color="purple" />
                    </div>
                  </div>

                  {/* Nursing Homes */}
                  <div className="bg-white border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <span className="text-2xl">🏘️</span> Nursing Homes & Long-Term Care
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <MiniStat label="Total Facilities" value={facilitySummary.nursingHomes.total} />
                      <MiniStat label="Total Beds" value={facilitySummary.nursingHomes.totalBeds} color="blue" />
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Tab */}
              {activeTab === 'progress' && (
                <div className="space-y-6">
                  {/* Overall Progress */}
                  <div className="bg-white border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Quiz Performance</h3>
                    {quizStats && quizStats.totalSessions > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MiniStat label="Sessions" value={quizStats.totalSessions} />
                        <MiniStat
                          label="Avg Score"
                          value={`${Math.round(quizStats.averageScore)}%`}
                          color={quizStats.averageScore >= 80 ? 'green' : 'yellow'}
                        />
                        <MiniStat label="Best Score" value={`${quizStats.bestScore}%`} color="green" />
                        <MiniStat label="Questions" value={quizStats.totalQuestions} />
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-4xl mb-4">📝</p>
                        <p>No quiz sessions completed yet.</p>
                        <p className="text-sm mt-2">Start a quiz to track your progress!</p>
                      </div>
                    )}
                  </div>

                  {/* Progress by Quiz Type */}
                  <div className="bg-white border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Progress by Quiz Type</h3>
                    <div className="space-y-4">
                      <ProgressBar label="Beat Identification" progress={0} total={100} />
                      <ProgressBar label="Facility Location" progress={0} total={100} />
                      <ProgressBar label="Protocol Destination" progress={0} total={100} />
                      <ProgressBar label="Turn-by-Turn" progress={0} total={100} />
                    </div>
                  </div>

                  {/* Learning Queue (Spaced Repetition) */}
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Spaced Repetition Queue</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Items due for review will appear here based on your learning history.
                    </p>
                    <div className="text-center py-4 text-gray-400">
                      <p>No items due for review</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ title, value, icon, color }: { title: string; value: number | string; icon: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`${colorClasses[color]} border-2 rounded-xl p-4 text-center`}>
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-sm text-gray-600">{title}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const colorClasses: Record<string, string> = {
    red: 'text-red-600',
    orange: 'text-orange-600',
    yellow: 'text-yellow-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
  };

  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color ? colorClasses[color] : 'text-gray-800'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ChecklistItem({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
        done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
      }`}>
        {done ? '✓' : '○'}
      </div>
      <span className={done ? 'text-gray-700' : 'text-gray-500'}>{text}</span>
    </div>
  );
}

function ProgressBar({ label, progress, total }: { label: string; progress: number; total: number }) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default Dashboard;
