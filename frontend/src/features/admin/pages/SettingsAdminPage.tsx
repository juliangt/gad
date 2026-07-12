import { useState } from 'react';
import { Settings, Sliders, ToggleLeft, Wrench, ScrollText } from 'lucide-react';
import { AdminNav } from '../components/AdminNav';
import { UserDefaultsTab } from '../components/settings/UserDefaultsTab';
import { OperationalTab } from '../components/settings/OperationalTab';
import { FeatureFlagsTab } from '../components/settings/FeatureFlagsTab';
import { MaintenanceTab } from '../components/settings/MaintenanceTab';
import { AuditTab } from '../components/settings/AuditTab';

const TABS = [
  { key: 'defaults', label: 'Defaults', icon: Sliders },
  { key: 'operational', label: 'Operativos', icon: Settings },
  { key: 'flags', label: 'Feature flags', icon: ToggleLeft },
  { key: 'maintenance', label: 'Mantenimiento', icon: Wrench },
  { key: 'audit', label: 'Auditoría', icon: ScrollText },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsAdminPage() {
  const [tab, setTab] = useState<TabKey>('defaults');

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">Configuración global</h1>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          <AdminNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div role="tablist" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  tab === t.key ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600'
                }`}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'defaults' && <UserDefaultsTab />}
        {tab === 'operational' && <OperationalTab />}
        {tab === 'flags' && <FeatureFlagsTab />}
        {tab === 'maintenance' && <MaintenanceTab />}
        {tab === 'audit' && <AuditTab />}
      </main>
    </div>
  );
}
