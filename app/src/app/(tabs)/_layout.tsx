// Bottom navigation from the mockup: Tour · Ranking · Ask NORA · Sharing · Profile.
// Ask NORA sits in the middle as a raised orb to give it emphasis.
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View, type ColorValue, type GestureResponderEvent } from 'react-native';
import Tabs from 'expo-router/js-tabs';
import { colors, fontFamily } from '../../components/ui';
import { tapSelection } from '../../lib/haptics';

function TabIcon({ name, color }: { name: SFSymbol; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={24} type="monochrome" />;
}

/** The raised Ask NORA button: a 53 pt rounded square with a white rim, floating 17 pt above the bar. */
function AskButton({ onPress, focused }: { onPress?: (e: GestureResponderEvent) => void; focused: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask NORA"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={s.askButton}
    >
      <View style={s.orb}>
        {/* The mockup's --blue-gradient: see-through blue, so what's behind shows faintly.
            Drawn by React Native itself, so it needs no native module. */}
        <View style={s.orbFill}>
          <SymbolView name="sparkle" tintColor={colors.accentDark} size={22} type="monochrome" />
        </View>
      </View>
      <Text style={s.askLabel}>Ask NORA</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenListeners={{ tabPress: () => tapSelection() }}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: s.bar,
        tabBarLabelStyle: s.label,
      }}
    >
      <Tabs.Screen
        name="tour"
        options={{
          title: 'Tour',
          tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'house.fill' : 'house'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'Ranking', tabBarIcon: ({ color }) => <TabIcon name="list.bullet" color={color} /> }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask NORA',
          tabBarButton: (props) => (
            <AskButton onPress={props.onPress} focused={!!(props.accessibilityState?.selected ?? props['aria-selected'])} />
          ),
        }}
      />
      <Tabs.Screen
        name="sharing"
        options={{
          title: 'Sharing',
          tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'person.2.fill' : 'person.2'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'person.fill' : 'person'} color={color} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopColor: '#D8DDE6',
    borderTopWidth: 1,
    overflow: 'visible',
  },
  // iOS tab bar labels are 10 pt; the one exception to NORA's 12 pt floor.
  label: { fontFamily, fontSize: 10, fontWeight: '600' },
  askButton: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  orb: {
    position: 'absolute',
    top: -17,
    width: 53,
    height: 53,
    borderRadius: 21,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    overflow: 'visible',
    shadowColor: 'rgb(33,150,255)',
    shadowOpacity: 0.19,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
  },
  orbFill: {
    flex: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    experimental_backgroundImage: 'linear-gradient(145deg, rgba(33,150,255,0.38), rgba(76,185,255,0.24))',
  },
  askLabel: { fontFamily, fontSize: 10, fontWeight: '600', color: colors.accent },
});
