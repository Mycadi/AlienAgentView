import { useSettingsStore } from '../../stores/settingsStore';
import KanbanBoard from './KanbanBoard';
import ListView from './ListView';
import GridView from './GridView';

export default function AgentView() {
  const { viewMode } = useSettingsStore();

  return (
    <div className="h-full flex flex-col min-h-0">
      {viewMode === 'kanban' && <KanbanBoard />}
      {viewMode === 'list' && <ListView />}
      {viewMode === 'grid' && <GridView />}
    </div>
  );
}
