import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import MetronomeScreen from './src/screens/MetronomeScreen';
import TargetsScreen from './src/screens/TargetsScreen';
import RunnerProfileSetup from './src/screens/RunnerProfileSetup';
import WorkoutHistoryScreen from './src/screens/WorkoutHistoryScreen';
import analytics from './src/services/AnalyticsService';
import CrashReportingService from './src/services/CrashReportingService';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';

// Initialize crash reporting as early as possible
CrashReportingService.initialize();

const Tab = createBottomTabNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  useEffect(() => {
    // Track app launch
    analytics.track('app_launch', {
      platform: 'mobile',
      version: '1.0.0'
    });
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  const handleScreenChange = (state) => {
    if (state) {
      const routeName = state.routes[state.index].name;
      analytics.trackScreen(routeName);
    }
  };

  return (
    <NavigationContainer
      theme={{
        dark: false,
        colors: {
          primary: '#000000',
          background: '#FFFFFF',
          card: '#FFFFFF',
          text: '#000000',
          border: '#E5E5E5',
          notification: '#000000',
        },
      }}
      onStateChange={handleScreenChange}
    >
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#000000',
          tabBarInactiveTintColor: '#666666',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E5E5E5',
            borderTopWidth: 1,
            paddingTop: 12,
            paddingBottom: 32,
            height: 85,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 10,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          },
          tabBarIcon: () => null,
          tabBarItemStyle: {
            paddingVertical: 8,
          },
          headerStyle: {
            backgroundColor: '#FFFFFF',
            borderBottomColor: '#E5E5E5',
            borderBottomWidth: 1,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 10,
          },
          headerTintColor: '#000000',
          headerTitleStyle: {
            fontWeight: '900',
            fontSize: 22,
            letterSpacing: 2,
            textTransform: 'uppercase',
          },
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ 
            headerShown: false,
            tabBarLabel: 'HOME'
          }}
        />
        <Tab.Screen 
          name="History" 
          component={WorkoutHistoryScreen}
          options={{ 
            title: 'HISTORY',
            tabBarLabel: 'HISTORY'
          }}
        />
        <Tab.Screen 
          name="Metronome" 
          component={MetronomeScreen}
          options={{ 
            title: 'METRONOME',
            tabBarLabel: 'RUN'
          }}
        />
        <Tab.Screen 
          name="Targets" 
          component={TargetsScreen}
          options={{ 
            title: 'TARGETS',
            tabBarLabel: 'TARGETS'
          }}
        />
        <Tab.Screen 
          name="Profile" 
          component={RunnerProfileSetup}
          options={{ 
            title: 'PROFILE',
            tabBarLabel: 'PROFILE'
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
