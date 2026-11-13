// iOS home-screen widget: today's tasks, focus against the goal and flashcards due. Its layout runs in the widget's
// own runtime (the 'widget' directive), so it may only use @expo/ui components and plain JavaScript on its props:
// no app imports, hooks or state. All text arrives already translated in `props`.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const Today = (props, env) => {
  'widget';
  const small = env.widgetFamily === 'systemSmall';
  const titles = (props.titles || []).slice(0, small ? 2 : 3);
  return (
    <VStack alignment="leading" spacing={3} modifiers={[padding({ all: 4 })]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#5B6CF0')]}>{props.kicker}</Text>
        <Spacer />
        {props.overdueText ? <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#D64545')]}>{props.overdueText}</Text> : null}
      </HStack>
      <Text modifiers={[font({ size: small ? 16 : 18, weight: 'bold' }), lineLimit(1)]}>{props.headline}</Text>
      {titles[0] ? <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{`• ${titles[0]}`}</Text> : null}
      {titles[1] ? <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{`• ${titles[1]}`}</Text> : null}
      {titles[2] ? <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{`• ${titles[2]}`}</Text> : null}
      <Spacer />
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#1E9E6A'), lineLimit(1)]}>{props.focusText}</Text>
      {props.cardsText ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.cardsText}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('Today', Today, { kicker: 'TODAY', headline: 'Open the app to see your day', titles: [], focusText: '' });
