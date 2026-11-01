import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CategoryIcon, PriorityBadge, SeverityBadge, StatusBadge, statusColor } from '@/components/ui/Badges';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDateTime, formatDistance, timeAgo } from '@/lib/format';
import { factorShare } from '@/lib/priority';
import type { HazardSummary, Priority, ReportStatus, StatusEvent } from '@/lib/types';
import { priorityColor, severityColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Compact hazard row used in lists (home, map list, my reports). */
export function HazardRow({ hazard, onPress, showStatus }: { hazard: HazardSummary; onPress?: () => void; showStatus?: boolean }) {
  const { p, isRTL } = useTheme();
  const { t } = useTranslation();
  const place = [hazard.address, hazard.city].filter(Boolean).join(' · ') || t('common.unknownPlace');
  return (
    <Card
      onPress={onPress ?? (() => router.push(`/hazard/${hazard.id}`))}
      accessibilityLabel={`${t(`categories.${hazard.category}`)}, ${t(`severity.${hazard.severity}`)}, ${place}`}
      style={{ padding: 14 }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <CategoryIcon category={hazard.category} color={severityColor(p, hazard.severity)} size={46} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {t(`categories.${hazard.category}`)}
            </Text>
            {hazard.distance_m != null ? (
              <Text variant="caption" tone="cyan">
                {formatDistance(hazard.distance_m)}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {place}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {showStatus ? <StatusBadge status={hazard.status} /> : <SeverityBadge severity={hazard.severity} />}
            {hazard.priority?.active ? <PriorityBadge level={hazard.priority.level} score={hazard.priority.score} /> : null}
          </View>
        </View>
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={p.textFaint} />
      </View>
    </Card>
  );
}

/** Explainable priority: score, level, and each factor's input and contribution. */
export function PriorityExplainer({ priority }: { priority: Priority }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!priority.active) {
    return (
      <Text variant="caption" tone="muted">
        {t('priority.none')}
      </Text>
    );
  }
  const color = priorityColor(p, priority.level);
  const shares = factorShare(priority);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: color + '22',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: color + '66',
          }}
        >
          <Text variant="stat" style={{ color, fontSize: 24 }}>
            {priority.score}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="semibold" style={{ color }}>
            {t(`priority.${priority.level}`)}
          </Text>
          <Text variant="caption" tone="muted">
            {t('priority.disclaimer')}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={p.primary} />
        <Text variant="caption" tone="primary" weight="semibold">
          {t('priority.explain')}
        </Text>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn} style={{ gap: 10 }}>
          {priority.factors.map((f) => {
            const share = shares.find((s) => s.key === f.key);
            const excluded = f.weight === 0;
            const input =
              f.key === 'severity'
                ? t(`severity.${String(f.input)}`)
                : f.key === 'maintenance_status'
                  ? t(`status.${String(f.input)}`)
                  : f.input == null
                    ? '—'
                    : String(f.input);
            return (
              <View key={f.key} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" weight="medium">
                    {t(`priority.f_${f.key}`)} · {input}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {excluded ? t('priority.noTraffic') : `${f.score}/100 · ${t('priority.weight', { weight: share?.percent ?? 0 })}`}
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: p.surface2, overflow: 'hidden' }}>
                  <View style={{ width: `${excluded ? 0 : (f.score ?? 0)}%`, height: '100%', backgroundColor: color, opacity: 0.85 }} />
                </View>
              </View>
            );
          })}
          <Text variant="caption" tone="faint">
            {priority.model}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const MAIN_FLOW: ReportStatus[] = ['submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved'];

/** Report tracking timeline: the main path plus side states, each with real timestamps. */
export function StatusTimeline({ events, current }: { events: StatusEvent[]; current: ReportStatus }) {
  const { p } = useTheme();
  const { t } = useTranslation();
  const reached = new Map<ReportStatus, StatusEvent>();
  for (const e of events) reached.set(e.to_status, e);
  const offPath = events.filter((e) => !MAIN_FLOW.includes(e.to_status));
  const currentIndex = MAIN_FLOW.indexOf(current);

  return (
    <View style={{ gap: 0 }}>
      {MAIN_FLOW.map((status, i) => {
        const event = reached.get(status);
        const done = !!event || (currentIndex >= 0 && i <= currentIndex);
        const isCurrent = status === current;
        const color = done ? statusColor(p, status) : p.textFaint;
        return (
          <Animated.View key={status} entering={FadeInDown.delay(i * 60)} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 22 }}>
              <View
                style={{
                  width: isCurrent ? 20 : 14,
                  height: isCurrent ? 20 : 14,
                  borderRadius: 10,
                  marginTop: 3,
                  backgroundColor: done ? color : 'transparent',
                  borderWidth: 2,
                  borderColor: color,
                }}
              />
              {i < MAIN_FLOW.length - 1 ? (
                <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: done ? color : p.border, opacity: done ? 0.6 : 1 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 14 }}>
              <Text weight={isCurrent ? 'semibold' : 'medium'} tone={done ? 'default' : 'faint'}>
                {t(`status.${status}`)}
              </Text>
              {event ? (
                <Text variant="caption" tone="muted">
                  {formatDateTime(event.created_at)}
                </Text>
              ) : null}
              {event?.note ? (
                <Text variant="caption" style={{ marginTop: 2 }}>
                  “{event.note}”
                </Text>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
      {offPath.map((e) => (
        <View
          key={e.id}
          style={{
            flexDirection: 'row',
            gap: 10,
            padding: 12,
            borderRadius: 14,
            marginTop: 6,
            backgroundColor: statusColor(p, e.to_status) + '18',
          }}
        >
          <Ionicons name="git-branch-outline" size={18} color={statusColor(p, e.to_status)} />
          <View style={{ flex: 1 }}>
            <Text weight="semibold">{t(`status.${e.to_status}`)}</Text>
            <Text variant="caption" tone="muted">
              {formatDateTime(e.created_at)} · {timeAgo(e.created_at)}
            </Text>
            {e.note ? <Text variant="caption">“{e.note}”</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
