import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  MessageCircle, 
  User, 
  Search, 
  Clock, 
  Users, 
  Coffee,
  Beer,
  Utensils,
  Footprints,
  Calendar,
  AlertCircle,
  LocateFixed,
  Navigation,
  Check
} from 'lucide-react';
import { MapBackground } from './components/MapBackground';
import { cn } from './lib/utils';

// --- MOCK DATA ---
const MOCK_PLANS = [
  {
    id: '1',
    title: 'Café de especialidad',
    description: 'Tengo ganas de probar el nuevo café de origen en Lattente. ¿Alguien se suma para charlar un rato?',
    activity: 'coffee',
    mode: 'now',
    distance: '300m',
    participants: '1/2',
    lat: -34.5880,
    lng: -58.4310,
    host: { name: 'Sofía', rating: '4.9 ⭐', avatar: 'S' }
  },
  {
    id: '2',
    title: 'Cerveza artesanal post-oficina',
    description: 'Cortando la semana con unas IPAs. Ya somos dos, buscamos uno o dos más para armar mesa.',
    activity: 'drinks',
    mode: 'now',
    distance: '800m',
    participants: '2/4',
    lat: -34.5920,
    lng: -58.4250,
    host: { name: 'Martín', rating: '4.7 ⭐', avatar: 'M' }
  },
  {
    id: '3',
    title: 'Caminata por el Rosedal',
    description: 'Salir a caminar un rato y aprovechar el sol de la tarde. Ritmo tranquilo.',
    activity: 'walk',
    mode: 'scheduled',
    time: '18:30',
    distance: '1.2km',
    participants: '1/3',
    lat: -34.5800,
    lng: -58.4100,
    host: { name: 'Lucía', rating: '5.0 ⭐', avatar: 'L' }
  }
];

// --- COMPONENTS ---

// 1. GpsIndicator Component
function GpsIndicator({ status }: { status: 'searching' | 'fixed' | 'denied' }) {
  return (
    <div className={cn(
      "glass-panel rounded-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium transition-all",
      status === 'searching' ? "text-amber-600 border-amber-200/50" : "",
      status === 'fixed' ? "text-brand-600 border-brand-200/50" : "",
      status === 'denied' ? "text-red-500 border-red-200/50" : ""
    )}>
      {status === 'searching' && (
        <>
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Buscando señal...
        </>
      )}
      {status === 'fixed' && (
        <>
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          Ubicación precisa
        </>
      )}
      {status === 'denied' && (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          Sin ubicación
        </>
      )}
    </div>
  );
}

// 2. PlanCard Component
function PlanCard({ plan, onClick }: { plan: typeof MOCK_PLANS[0], onClick?: () => void }) {
  const getActivityIcon = (type: string) => {
    switch(type) {
      case 'coffee': return <Coffee className="w-4 h-4" />;
      case 'drinks': return <Beer className="w-4 h-4" />;
      case 'food': return <Utensils className="w-4 h-4" />;
      case 'walk': return <Footprints className="w-4 h-4" />;
      default: return <MapPin className="w-4 h-4" />;
    }
  };

  return (
    <div 
      onClick={onClick}
      className="glass-panel p-4 rounded-2xl flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-900/5 flex items-center justify-center text-gray-700">
            {getActivityIcon(plan.activity)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-base leading-tight">{plan.title}</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
              <MapPin className="w-3 h-3" />
              <span>A {plan.distance} de ti</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mt-1">
        <div className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
          plan.mode === 'now' ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-600"
        )}>
          {plan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
          {plan.mode === 'now' ? 'Ahora' : `Hoy ${plan.time}`}
        </div>
        <div className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {plan.participants}
        </div>
      </div>
    </div>
  );
}

// 3. BottomNav Component
function BottomNav({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (v: string) => void }) {
  const navItems = [
    { id: 'explore', icon: Search, label: 'Explorar' },
    { id: 'matches', icon: MessageCircle, label: 'Matches' },
    { id: 'profile', icon: User, label: 'Perfil' }
  ];

  return (
    <div className="absolute bottom-0 w-full z-50 px-6 pb-6 pt-4 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none">
      <div className="glass-panel rounded-full flex justify-between items-center px-6 py-3 shadow-lg pointer-events-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 w-16 transition-colors",
                isActive ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <item.icon className={cn("w-6 h-6 transition-transform", isActive ? "stroke-2 scale-110" : "stroke-[1.5]")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- VIEWS ---

function ExploreView({ userLocation, gpsStatus, onOpenCreatePlan, onSelectPlan }: any) {
  return (
    <>
      <MapBackground 
        userLocation={userLocation} 
        plans={MOCK_PLANS} 
        onPlanClick={onSelectPlan}
      />

      {/* Top Floating Area */}
      <div className="absolute top-0 w-full z-40 p-4 pt-safe-top flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-3xl font-bold tracking-tighter text-gray-900 drop-shadow-md">
            GAD
          </h1>
        </div>
        <div className="pointer-events-auto">
          <GpsIndicator status={gpsStatus} />
        </div>
      </div>

      {/* Central Map Focus button */}
      <div className="absolute bottom-40 right-4 z-40">
        <button className="glass-button w-12 h-12 rounded-full flex items-center justify-center text-gray-700 shadow-lg pointer-events-auto">
          <LocateFixed className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Sheet Area */}
      <div className="absolute bottom-20 w-full z-40 flex flex-col pointer-events-none">
        <div className="h-8 bg-gradient-to-t from-white/10 to-transparent w-full" />
        <div className="px-4 pb-6 flex flex-col gap-3 pointer-events-auto max-h-[40vh] overflow-y-auto hide-scrollbar">
          <div className="flex items-center justify-between mb-1 px-1">
            <h2 className="text-sm font-semibold text-gray-800 drop-shadow-sm">Cerca de ti</h2>
            <span className="text-xs font-medium text-brand-600 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full shadow-sm cursor-pointer">
              Ver todos
            </span>
          </div>
          {MOCK_PLANS.map(plan => (
            <PlanCard key={plan.id} plan={plan} onClick={() => onSelectPlan(plan.id)} />
          ))}
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <button onClick={onOpenCreatePlan} className="bg-gray-900 text-white shadow-xl shadow-gray-900/20 w-14 h-14 rounded-full flex items-center justify-center transform transition-transform active:scale-95 border border-gray-800">
          <Navigation className="w-6 h-6 fill-current" />
        </button>
      </div>
    </>
  );
}

function MatchesView() {
  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top">
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
        <p className="text-sm text-gray-500 mt-1">Tus salidas confirmadas</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        <div className="p-4 border border-gray-100 rounded-2xl flex items-center gap-4 bg-gray-50/50">
          <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold">
            J
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Julieta</h3>
            <p className="text-sm text-gray-500">Café en Palermo • Hoy 18:30</p>
          </div>
          <button className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-sm active:scale-95">
            <MessageCircle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileView() {
  return (
    <div className="w-full h-full bg-white flex flex-col pt-safe-top">
      <div className="px-6 py-6 pb-8 border-b border-gray-100 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4">
          M
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Martín</h1>
        <p className="text-sm text-gray-500 mt-1">Reputación: 4.8 ⭐</p>
        <div className="flex gap-2 mt-4">
          <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">Café</span>
          <span className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">Cerveza</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">Contactos de confianza</span>
          </div>
        </button>
        <button className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">Editar perfil</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function CreatePlanModal({ onClose }: { onClose: () => void }) {
  const [activity, setActivity] = useState('coffee');
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  
  const next7Days = React.useMemo(() => {
    const days = [];
    const today = new Date();
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      let label = dayNames[d.getDay()];
      if (i === 0) label = 'Hoy';
      else if (i === 1) label = 'Mañ';
      days.push({
        id: d.toISOString().split('T')[0],
        label: label,
        dateNum: d.getDate(),
      });
    }
    return days;
  }, []);

  const timeRanges = [
    { id: 'morning', label: 'Mañana', start: 9, end: 12 },
    { id: 'noon', label: 'Mediodía', start: 12, end: 15 },
    { id: 'afternoon', label: 'Tarde', start: 15, end: 19 },
    { id: 'night', label: 'Noche', start: 19, end: 23 },
  ];

  const [selectedDate, setSelectedDate] = useState(next7Days[0].id);
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />
      
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 animate-in slide-in-from-bottom-full duration-300 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar">
        {/* Drag handle */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />

        <div className="flex justify-between items-center mb-1">
          <h2 className="text-xl font-bold text-gray-900">Crear Plan</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 flex-shrink-0">✕</button>
        </div>
        
        <div className="flex flex-col gap-5">
          {/* Actividad */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">¿Qué querés hacer?</label>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              {[
                { id: 'coffee', icon: Coffee, label: 'Café' },
                { id: 'drinks', icon: Beer, label: 'Cerveza' },
                { id: 'walk', icon: Footprints, label: 'Caminata' }
              ].map(act => (
                <button 
                  key={act.id}
                  onClick={() => setActivity(act.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-colors",
                    activity === act.id ? "bg-brand-50 text-brand-600 border border-brand-200" : "bg-gray-50 text-gray-600 border border-gray-200"
                  )}
                >
                  <act.icon className="w-4 h-4" /> {act.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Modalidad */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">¿Cuándo?</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setMode('now')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border",
                  mode === 'now' ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-gray-50 text-gray-600 border-gray-200"
                )}
              >
                <Clock className="w-4 h-4" /> Ahora
              </button>
              <button 
                onClick={() => setMode('scheduled')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border",
                  mode === 'scheduled' ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-gray-50 text-gray-600 border-gray-200"
                )}
              >
                <Calendar className="w-4 h-4" /> Agendar
              </button>
            </div>
          </div>

          {/* Calendario Simplificado (solo si mode === 'scheduled') */}
          {mode === 'scheduled' && (
            <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Selector de Día */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Día</label>
                <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                  {next7Days.map((day) => (
                    <button 
                      key={day.id}
                      onClick={() => setSelectedDate(day.id)}
                      className={cn(
                        "flex flex-col items-center justify-center min-w-[3.5rem] py-2 rounded-xl border transition-colors",
                        selectedDate === day.id ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-gray-50 border-gray-200 text-gray-600"
                      )}
                    >
                      <span className="text-xs font-medium opacity-80">{day.label}</span>
                      <span className="text-lg font-bold">{day.dateNum}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Rango Horario */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Rango Horario</label>
                <div className="grid grid-cols-2 gap-2">
                  {timeRanges.map((range) => {
                    const isSelected = selectedRange === range.id;
                    
                    if (isSelected) {
                      const hours = Array.from({length: range.end - range.start}, (_, i) => range.start + i);
                      return (
                        <div key={range.id} className="h-16 flex p-1.5 gap-1.5 rounded-xl border border-brand-200 bg-brand-50 animate-in fade-in duration-200 items-center justify-center">
                          {hours.map(h => (
                            <button 
                              key={h}
                              onClick={() => setSelectedHour(h)}
                              className={cn(
                                "flex-1 h-full rounded-lg text-xs font-bold transition-all flex items-center justify-center",
                                selectedHour === h ? "bg-brand-600 text-white shadow-md scale-105" : "bg-white text-brand-700 shadow-sm border border-brand-100 active:scale-95"
                              )}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      );
                    }

                    return (
                      <button 
                        key={range.id}
                        onClick={() => {
                          setSelectedRange(range.id);
                          setSelectedHour(null);
                        }}
                        className="h-16 flex flex-col justify-center items-start px-3 rounded-xl border transition-colors text-left bg-gray-50 border-gray-200 text-gray-600 active:scale-95"
                      >
                        <span className="font-semibold text-sm leading-tight">{range.label}</span>
                        <span className="text-xs opacity-80 mt-0.5">{range.start}:00 - {range.end}:00 hs</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          <button className="w-full mt-2 py-3.5 bg-gray-900 text-white rounded-xl font-semibold shadow-lg shadow-gray-900/20 active:scale-[0.98] transition-transform flex justify-center items-center gap-2">
            Publicar Plan
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function App() {
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'fixed' | 'denied'>('searching');
  const [activeTab, setActiveTab] = useState('explore');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const selectedPlan = MOCK_PLANS.find(p => p.id === selectedPlanId);

  // Simulate GPS search on mount
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setGpsStatus('fixed');
      setUserLocation([-34.5900, -58.4300]);
    }, 2500);
    return () => clearTimeout(timer1);
  }, []);

  return (
    <div className="w-full h-[100dvh] bg-gray-100 flex justify-center items-center font-sans overflow-hidden">
      {/* Mobile Device Container */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-hidden flex flex-col">
        
        {activeTab === 'explore' && <ExploreView userLocation={userLocation} gpsStatus={gpsStatus} onOpenCreatePlan={() => setIsCreatePlanOpen(true)} onSelectPlan={setSelectedPlanId} />}
        {activeTab === 'matches' && <MatchesView />}
        {activeTab === 'profile' && <ProfileView />}

        {/* Bottom Navigation Layer */}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        
        {/* Modals */}
        {isCreatePlanOpen && (
          <CreatePlanModal onClose={() => setIsCreatePlanOpen(false)} />
        )}

        {selectedPlan && (
          <div className="absolute inset-0 z-[100] flex flex-col justify-end">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
              onClick={() => setSelectedPlanId(null)} 
            />
            
            {/* Content Bottom Sheet */}
            <div className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 animate-in slide-in-from-bottom-full duration-300 shadow-2xl">
              {/* Drag handle */}
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-2" />
              
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                      selectedPlan.mode === 'now' ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-600"
                    )}>
                      {selectedPlan.mode === 'now' ? <Clock className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                      {selectedPlan.mode === 'now' ? 'Ahora' : `Hoy ${selectedPlan.time}`}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      A {selectedPlan.distance}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 leading-tight">{selectedPlan.title}</h2>
                </div>
                <button 
                  onClick={() => setSelectedPlanId(null)} 
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 flex-shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Host Profile */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-lg">
                  {selectedPlan.host.avatar}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">Organizado por {selectedPlan.host.name}</h3>
                  <p className="text-xs text-gray-500">Reputación: {selectedPlan.host.rating}</p>
                </div>
                <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-sm flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-brand-500" />
                  {selectedPlan.participants}
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Sobre el plan</h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {selectedPlan.description}
                </p>
              </div>

              {/* Action */}
              <button className="w-full mt-2 py-3.5 bg-brand-600 text-white rounded-xl font-semibold shadow-lg shadow-brand-600/20 active:scale-[0.98] transition-transform flex justify-center items-center gap-2">
                <Check className="w-5 h-5" />
                Postularme
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
