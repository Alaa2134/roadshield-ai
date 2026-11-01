import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { HazardCategory, HazardSeverity, ReportStatus, TaskStatus } from '@/lib/types';
import { haptic } from '@/lib/haptics';
import { priorityColor, severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { IconName } from './Button';
import { Text } from './Text';

export const categoryIcon: Record<HazardCategory, IconName> = {
  pothole: 'ellipse',
  crack: 'git-branch-outline',
  surface_damage: 'grid-outline',
  flooding: 'water',
  damaged_signage: 'warning-outline',
  obstruction: 'construct-outline',
  street_lighting: 'bulb-outline',
  other: 'alert-circle-outline',
};

export function Pill({ label, color, icon, solid }: { label: string; color: string; icon?: IconName; solid?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: solid ? color : color + '22',
        borderWidth: 1,
        borderColor: solid ? color : color + '55',
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={solid ? '#fff' : color} /> : null}
      <Text variant="label" style={{ color: solid ? '#fff' : color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function statusColor(p: ReturnType<typeof useTheme>['p'], status: ReportStatus | TaskStatus): string {
  switch (status) {
    case 'resolved':
    case 'completed':
      return p.success;
    case 'verified':
    case 'assigned':
      return p.primary;
    case 'in_progress':
    case 'completion_requested':
      return p.cyan;
    case 'rejected':
    case 'cancelled':
      return p.danger;
    case 'duplicate':
      return p.textFaint;
    case 'reopened':
      return p.warning;
    default:
      return p.warning;
  }
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  return <Pill label={t(`status.${status}`)} color={statusColor(p, status)} />;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  return <Pill label={t(`taskStatus.${status}`)} color={statusColor(p, status)} />;
}

export function SeverityBadge({ severity }: { severity: HazardSeverity }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  return <Pill label={t(`severity.${severity}`)} color={severityColor(p, severity)} icon="speedometer-outline" />;
}

export function PriorityBadge({ level, score }: { level?: string; score?: number }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  if (!level || level === 'none') return null;
  return <Pill label={`${t(`priority.${level}`)} · ${score ?? 0}`} color={priorityColor(p, level)} icon="flag" solid />;
}

export function CategoryIcon({ category, size = 40, color }: { category: HazardCategory; size?: number; color?: string }) {
  const { p } = useTheme();
  const c = color ?? p.primary;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: c + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={categoryIcon[category]} size={size * 0.5} color={c} />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { p } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 18,
        backgroundColor: selected ? p.primary : p.surface,
        borderWidth: 1,
        borderColor: selected ? p.primary : p.border,
      }}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? '#fff' : p.textMuted} /> : null}
      <Text variant="caption" weight="semibold" style={{ color: selected ? '#fff' : p.text }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
