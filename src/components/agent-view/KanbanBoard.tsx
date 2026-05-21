import { useClaudeSessions } from '../../hooks/useClaudeSessions';
import { useSettingsStore } from '../../stores/settingsStore';
import KanbanColumn from './KanbanColumn';

export default function KanbanBoard() {
  const { workingSessions, needsInputSessions, doneSessions } = useClaudeSessions();
  const { language } = useSettingsStore();
  const isZh = language === 'zh-CN';

  return (
    <div className="h-full px-[26px] pb-[16px] flex gap-[12px] overflow-hidden">
      <KanbanColumn
        title={isZh ? '工作中' : 'Working'}
        subtitle={isZh ? '正在运行的任务' : 'Actively running tasks'}
        status="working"
        sessions={workingSessions}
        titleColor="text-text-primary"
        dotColor="text-status-working"
      />
      <KanbanColumn
        title={isZh ? '需要输入' : 'Needs input'}
        subtitle={isZh ? '等待你的输入' : 'Waiting for your input'}
        status="needsinput"
        sessions={needsInputSessions}
        titleColor="text-text-primary"
        dotColor="text-status-needs-input"
      />
      <KanbanColumn
        title={isZh ? '已完成' : 'Done'}
        subtitle={isZh ? '最近完成' : 'Recently completed'}
        status="done"
        sessions={doneSessions}
        titleColor="text-text-primary"
        dotColor="text-status-done"
      />
    </div>
  );
}
