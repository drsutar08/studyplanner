// iOS home-screen widget: the next class with a live countdown. Its layout runs in the widget's own
// runtime (the 'widget' directive), so it may only use @expo/ui components and plain JavaScript on
// its props: no app imports, hooks or state. All text arrives already translated in `props`.
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const NextClass = (props, env) => {
  'widget';
  const small = env.widgetFamily === 'systemSmall';
  if (!props.title) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 4 })]}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(props.color || '#7A5CFA')]}>{props.kicker}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.emptyText}</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={3} modifiers={[padding({ all: 4 })]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(props.color)]}>{props.kicker}</Text>
        <Spacer />
        {props.live ? <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle('#1E9E6A')]}>{props.liveText}</Text> : null}
      </HStack>
      <Text modifiers={[font({ size: small ? 16 : 18, weight: 'bold' }), lineLimit(2)]}>{props.title}</Text>
      <Spacer />
      {props.startAt && !props.live ? (
        <Text date={new Date(props.startAt)} dateStyle="relative" modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(props.color)]} />
      ) : null}
      <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.timeText}</Text>
      {props.place ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.place}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('NextClass', NextClass, { kicker: 'NEXT CLASS', emptyText: 'No more classes today' });
