import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import Tabs from 'expo-router/js-tabs';
import { colors, fontFamily } from '../../components/ui';

function TabIcon({ name, color, size }: { name: SFSymbol; color: ColorValue; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} type="monochrome" />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily, fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="tour"
        options={{
          title: 'Tour',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name={focused ? 'house.fill' : 'house'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: 'Ranking',
          tabBarIcon: ({ color, size }) => <TabIcon name="list.number" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="homes"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'clock.fill' : 'clock'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sharing"
        options={{
          title: 'Sharing',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name={focused ? 'person.2.fill' : 'person.2'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'person.fill' : 'person'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
