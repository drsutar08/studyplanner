// Android home-screen widget: today's tasks, focus against the goal and flashcards due. Android widgets get a
// snapshot, refreshed whenever the app opens or the tasks change. The layout runs in the widget's own runtime (the
// 'widget' directive): only @expo/ui Jetpack Compose components and plain JavaScript on its props.
import { Column, Text } from '@expo/ui/jetpack-compose';
import { paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

const Today = (props) => {
  'widget';
  const titles = (props.titles || []).slice(0, 3);
  return (
    <Column modifiers={[paddingAll(12)]}>
      <Text color="#5B6CF0" style={{ fontSize: 11, fontWeight: 'bold' }}>{props.overdueText ? `${props.kicker} · ${props.overdueText}` : props.kicker}</Text>
      <Text style={{ fontSize: 16, fontWeight: 'bold' }} maxLines={1}>{props.headline}</Text>
      {titles[0] ? <Text style={{ fontSize: 12 }} maxLines={1}>{`• ${titles[0]}`}</Text> : null}
      {titles[1] ? <Text style={{ fontSize: 12 }} maxLines={1}>{`• ${titles[1]}`}</Text> : null}
      {titles[2] ? <Text style={{ fontSize: 12 }} maxLines={1}>{`• ${titles[2]}`}</Text> : null}
      <Text color="#1E9E6A" style={{ fontSize: 12, fontWeight: '600' }}>{props.focusText}</Text>
      {props.cardsText ? <Text style={{ fontSize: 12 }}>{props.cardsText}</Text> : null}
    </Column>
  );
};

export default createWidget('Today', Today, { kicker: 'TODAY', headline: 'Open the app to see your day', titles: [], focusText: '' });
