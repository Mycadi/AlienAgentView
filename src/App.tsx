import './styles/globals.css';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import StatusBar from './components/layout/StatusBar';
import WindowControls from './components/layout/WindowControls';
import AgentView from './components/agent-view/AgentView';
import ProjectsPage from './components/projects/ProjectsPage';
import SessionsPage from './components/sessions/SessionsPage';
import TerminalPage from './components/terminal/TerminalPage';
import SettingsPage from './components/settings/SettingsPage';
import { useSettingsStore } from './stores/settingsStore';

export default function App() {
  const { currentPage } = useSettingsStore();

  return (
    <div className="h-screen w-screen bg-[#030405] relative">
      <WindowControls />
      <div className="h-full w-full overflow-hidden border border-[#30260f] bg-bg-primary shadow-[0_0_42px_rgba(201,137,58,0.08)] flex">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col bg-[#07090d] border-l border-[#202532]/40">
          <Header />
          <main className="flex-1 min-h-0">
            {currentPage === 'agent-view' && <AgentView />}
            {currentPage === 'projects' && <ProjectsPage />}
            {currentPage === 'sessions' && <SessionsPage />}
            {currentPage === 'terminal' && <TerminalPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </main>
          <StatusBar />
        </div>
      </div>
    </div>
  );
}
