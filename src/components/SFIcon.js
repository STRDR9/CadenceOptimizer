import React from 'react';
import { SymbolView } from 'expo-symbols';

// Monochrome SF Symbol icon — replaces emoji throughout the app (FORGE-007).
export default function SFIcon({ name, size = 24, color = '#111111', style }) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
