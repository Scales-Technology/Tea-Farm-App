// ─── TeaLoader — World Class Falling Leaves Loading ──────────────────────────
import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Dimensions } from "react-native";
import { colors, fonts } from "../theme";

const { width, height } = Dimensions.get("window");

// Each leaf has its own animation values
interface LeafConfig {
  id:       number;
  emoji:    string;
  startX:   number;
  size:     number;
  duration: number;
  delay:    number;
  swayRange:number;
}

const LEAVES: LeafConfig[] = [
  { id: 1,  emoji: "🍃", startX: width * 0.1,  size: 28, duration: 2800, delay: 0,    swayRange: 40 },
  { id: 2,  emoji: "🌿", startX: width * 0.3,  size: 22, duration: 3200, delay: 400,  swayRange: 55 },
  { id: 3,  emoji: "🍃", startX: width * 0.55, size: 32, duration: 2500, delay: 800,  swayRange: 35 },
  { id: 4,  emoji: "🌱", startX: width * 0.75, size: 20, duration: 3600, delay: 200,  swayRange: 60 },
  { id: 5,  emoji: "🍃", startX: width * 0.88, size: 26, duration: 3000, delay: 600,  swayRange: 45 },
  { id: 6,  emoji: "🌿", startX: width * 0.2,  size: 18, duration: 3400, delay: 1000, swayRange: 50 },
  { id: 7,  emoji: "🍃", startX: width * 0.65, size: 24, duration: 2700, delay: 300,  swayRange: 38 },
  { id: 8,  emoji: "🌱", startX: width * 0.45, size: 30, duration: 3100, delay: 700,  swayRange: 42 },
];

interface TeaLoaderProps {
  message?: string;
  subMessage?: string;
}

export default function TeaLoader({
  message    = "Loading...",
  subMessage = "TeaFarm Pro",
}: TeaLoaderProps) {
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoPulse = useRef(new Animated.Value(1)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in the whole screen
    Animated.timing(fadeIn, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();

    // Logo entrance
    Animated.spring(logoScale, {
      toValue: 1, tension: 50, friction: 7, useNativeDriver: true,
    }).start();

    // Logo gentle pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(logoPulse, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Progress bar
    Animated.loop(
      Animated.sequence([
        Animated.timing(progressWidth, { toValue: width * 0.7, duration: 1500, useNativeDriver: false }),
        Animated.timing(progressWidth, { toValue: 0,           duration: 500,  useNativeDriver: false }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Falling leaves */}
      {LEAVES.map(leaf => (
        <FallingLeaf key={leaf.id} config={leaf} />
      ))}

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Logo */}
        <Animated.View style={[
          styles.logoRing,
          { transform: [{ scale: logoScale }] }
        ]}>
          <View style={styles.logoRingInner}>
            <Animated.Text style={[
              styles.logoEmoji,
              { transform: [{ scale: logoPulse }] }
            ]}>
              🍃
            </Animated.Text>
          </View>
          {/* Orbiting dot */}
          <OrbitingDot />
        </Animated.View>

        {/* App name */}
        <Text style={styles.appName}>TeaFarm Pro</Text>
        <View style={styles.taglineRow}>
          <View style={styles.taglineLine} />
          <Text style={styles.tagline}>Farm Management System</Text>
          <View style={styles.taglineLine} />
        </View>

        {/* Message */}
        <Text style={styles.message}>{message}</Text>
        {subMessage !== "TeaFarm Pro" && (
          <Text style={styles.subMessage}>{subMessage}</Text>
        )}

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
        </View>

        {/* Animated dots */}
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map(i => <BounceDot key={i} delay={i * 150} />)}
        </View>
      </View>

      {/* Bottom tagline */}
      <Text style={styles.footer}>Kenya 🇰🇪 · Powered by BLE Technology</Text>
    </Animated.View>
  );
}

// ── Falling Leaf Component ─────────────────────────────────────────────────────

function FallingLeaf({ config }: { config: LeafConfig }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate     = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(-80);
      translateX.setValue(0);
      rotate.setValue(0);
      opacity.setValue(0);

      Animated.parallel([
        // Fall down
        Animated.timing(translateY, {
          toValue:  height + 80,
          duration: config.duration,
          delay:    config.delay,
          useNativeDriver: true,
        }),
        // Sway left and right
        Animated.sequence([
          Animated.delay(config.delay),
          Animated.loop(
            Animated.sequence([
              Animated.timing(translateX, { toValue:  config.swayRange, duration: config.duration / 4, useNativeDriver: true }),
              Animated.timing(translateX, { toValue: -config.swayRange, duration: config.duration / 4, useNativeDriver: true }),
              Animated.timing(translateX, { toValue:  config.swayRange, duration: config.duration / 4, useNativeDriver: true }),
              Animated.timing(translateX, { toValue:  0,                duration: config.duration / 4, useNativeDriver: true }),
            ])
          ),
        ]),
        // Spin
        Animated.timing(rotate, {
          toValue:  1,
          duration: config.duration,
          delay:    config.delay,
          useNativeDriver: true,
        }),
        // Fade in then out
        Animated.sequence([
          Animated.delay(config.delay),
          Animated.timing(opacity, { toValue: 0.85, duration: 400, useNativeDriver: true }),
          Animated.delay(config.duration - 800),
          Animated.timing(opacity, { toValue: 0,    duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => animate()); // Loop
    };

    animate();
  }, []);

  const spin = rotate.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.Text
      style={{
        position:  "absolute",
        left:      config.startX,
        top:       0,
        fontSize:  config.size,
        opacity,
        transform: [
          { translateY },
          { translateX },
          { rotate: spin },
        ],
      }}
    >
      {config.emoji}
    </Animated.Text>
  );
}

// ── Orbiting Dot ───────────────────────────────────────────────────────────────

function OrbitingDot() {
  const angle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(angle, {
        toValue: 1, duration: 2000, useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotate = angle.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={[styles.orbitContainer, { transform: [{ rotate }] }]}>
      <View style={styles.orbitDot} />
    </Animated.View>
  );
}

// ── Bounce Dot ─────────────────────────────────────────────────────────────────

function BounceDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: -8, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0,  duration: 300, useNativeDriver: true }),
        Animated.delay(400),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.bounceDot, { transform: [{ translateY: anim }] }]} />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:        "absolute",
    top:             0,
    left:            0,
    right:           0,
    bottom:          0,
    backgroundColor: colors.primary,
    justifyContent:  "center",
    alignItems:      "center",
    zIndex:          999,
  },

  centerContent: {
    alignItems: "center",
    zIndex:     10,
  },

  // Logo
  logoRing: {
    width:          130,
    height:         130,
    borderRadius:   65,
    backgroundColor:"rgba(255,255,255,0.08)",
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   24,
    borderWidth:    1.5,
    borderColor:    "rgba(255,255,255,0.2)",
  },
  logoRingInner: {
    width:          90,
    height:         90,
    borderRadius:   45,
    backgroundColor:"rgba(255,255,255,0.12)",
    alignItems:     "center",
    justifyContent: "center",
    borderWidth:    1,
    borderColor:    "rgba(255,255,255,0.15)",
  },
  logoEmoji: { fontSize: 46 },

  orbitContainer: {
    position:   "absolute",
    width:      130,
    height:     130,
    alignItems: "center",
  },
  orbitDot: {
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: "rgba(255,255,255,0.8)",
    marginTop:       2,
  },

  // Text
  appName: {
    fontSize:      28,
    fontWeight:    "900",
    color:         "#fff",
    letterSpacing: 2,
    marginBottom:  6,
  },
  taglineRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
    marginBottom:  20,
  },
  taglineLine: {
    flex:            1,
    height:          1,
    width:           40,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  tagline: {
    fontSize:      10,
    color:         "rgba(255,255,255,0.6)",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  message: {
    fontSize:      fonts.sizes.md,
    fontWeight:    "600",
    color:         "rgba(255,255,255,0.9)",
    letterSpacing: 0.5,
    marginBottom:  6,
  },
  subMessage: {
    fontSize:  fonts.sizes.sm,
    color:     "rgba(255,255,255,0.55)",
    marginBottom: 20,
  },

  // Progress
  progressTrack: {
    width:           width * 0.7,
    height:          3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius:    2,
    overflow:        "hidden",
    marginBottom:    20,
  },
  progressBar: {
    height:          3,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius:    2,
  },

  // Dots
  dotsRow: {
    flexDirection: "row",
    gap:           10,
  },
  bounceDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: "rgba(255,255,255,0.7)",
  },

  // Footer
  footer: {
    position:      "absolute",
    bottom:        32,
    fontSize:      11,
    color:         "rgba(255,255,255,0.35)",
    letterSpacing: 0.5,
  },
});