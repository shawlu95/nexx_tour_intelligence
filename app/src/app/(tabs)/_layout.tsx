import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import Tabs from 'expo-router/js-tabs';
import { colors } from '../../components/ui';

function TabIcon({ name, color, size }: { name: SFSymbol; color: ColorValue; size: number }) {
  return <SymbolView name={name} tintColor={color} size={size} type="monochrome" />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tour',
          tabBarIcon: ({ color, size, focused }) => <TabIcon name={focused ? 'house.fill' : 'house'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="homes"
        options={{
          title: 'Homes',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'building.2.fill' : 'building.2'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'person.crop.circle.fill' : 'person.crop.circle'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
