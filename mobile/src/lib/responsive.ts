/**
 * Responsive utility for NexWare Mobile
 * Scales sizes relative to a 390px wide base design (iPhone 14 / mid-range Android).
 * Works on all screens: Xiaomi 360px, Poco 393px, Samsung 412px, large phones 428px+.
 */

import { Dimensions } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Scale a horizontal/width value */
export const ws = (size: number): number =>
  Math.round((size / BASE_WIDTH) * SCREEN_W);

/** Scale a vertical/height value */
export const hs = (size: number): number =>
  Math.round((size / BASE_HEIGHT) * SCREEN_H);

/** Scale a font size — slightly less aggressive so text does not grow too large */
export const fs = (size: number): number => {
  const scaled = (size / BASE_WIDTH) * SCREEN_W;
  return Math.round(Math.min(Math.max(scaled, size * 0.85), size * 1.3));
};

/** true if screen is small (Xiaomi-class, <380px wide) */
export const isSmallScreen = SCREEN_W < 380;

/** true if screen is large (Samsung-class, >410px wide) */
export const isLargeScreen = SCREEN_W > 410;

export const SCREEN_WIDTH = SCREEN_W;
export const SCREEN_HEIGHT = SCREEN_H;
