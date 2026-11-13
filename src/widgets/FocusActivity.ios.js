// iOS Live Activity for a running focus session or break: the lock screen and Dynamic Island count down
// on their own (SwiftUI timer text), so the app doesn't have to be open. Its layout runs in the widget's
// runtime (the 'widget' directive): only @expo/ui components and plain JavaScript on `props`, no app
// imports, hooks or state. All text arrives already translated.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

// props: { kicker, title, color, startAt, endAt (ms), paused, pausedText }
const FocusActivity = (props) => {
  'widget';
  const tint = props.color || '#8D9BFF';
  const timer = props.paused ? (
    <Text modifiers={[font({ size: 34, weight: 'bold' })]}>{props.pausedText}</Text>
  ) : (
    <Text timerInterval={{ lower: new Date(props.startAt), upper: new Date(props.endAt) }} countsDown modifiers={[font({ size: 34, weight: 'bold' })]} />
  );
  const small = props.paused ? (
    <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(tint)]}>{props.pausedText}</Text>
  ) : (
    <Text timerInterval={{ lower: new Date(props.startAt), upper: new Date(props.endAt) }} countsDown modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(tint)]} />
  );
  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 14 })]}>
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(tint)]}>{props.kicker}</Text>
          <Text modifiers={[font({ size: 16, weight: 'semibold' }), lineLimit(1)]}>{props.title}</Text>
        </VStack>
        <Spacer />
        {timer}
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={tint} />,
    compactTrailing: small,
    minimal: <Image systemName="timer" color={tint} />,
    expandedLeading: <Image systemName="timer" color={tint} size={22} />,
    expandedCenter: <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{props.title}</Text>,
    expandedTrailing: small,
    expandedBottom: <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(tint)]}>{props.kicker}</Text>,
  };
};

export default createLiveActivity('FocusActivity', FocusActivity);
