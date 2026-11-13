// Android home-screen widget: the next class. Android widgets get a snapshot (no timeline), refreshed
// whenever the app opens or the timetable changes. The layout runs in the widget's own runtime (the
// 'widget' directive): only @expo/ui Jetpack Compose components and plain JavaScript on its props.
import { Column, Text } from '@expo/ui/jetpack-compose';
import { paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

const NextClass = (props) => {
  'widget';
  if (!props.title) {
    return (
      <Column modifiers={[paddingAll(12)]}>
        <Text color={props.color || '#7A5CFA'} style={{ fontSize: 11, fontWeight: 'bold' }}>{props.kicker}</Text>
        <Text style={{ fontSize: 15, fontWeight: '600' }}>{props.emptyText}</Text>
      </Column>
    );
  }
  return (
    <Column modifiers={[paddingAll(12)]}>
      <Text color={props.color} style={{ fontSize: 11, fontWeight: 'bold' }}>{props.live ? `${props.kicker} · ${props.liveText}` : props.kicker}</Text>
      <Text style={{ fontSize: 16, fontWeight: 'bold' }} maxLines={2}>{props.title}</Text>
      <Text style={{ fontSize: 12 }}>{props.timeText}</Text>
      {props.place ? <Text style={{ fontSize: 12 }}>{props.place}</Text> : null}
    </Column>
  );
};

export default createWidget('NextClass', NextClass, { kicker: 'NEXT CLASS', emptyText: 'No more classes today' });
