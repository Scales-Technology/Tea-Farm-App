// ─── Onboarding Screen — TeaFarm Pro ─────────────────────────────────────────
// World-class intro screen with continuous falling tea leaves, app summary,
// feature highlights, and a CTA to navigate to Login/Register.
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, StatusBar, ScrollView, Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "teafarm_seen_onboarding";

const { width, height } = Dimensions.get("window");

// ── Tea leaf shapes (SVG-style unicode + emojis) ──────────────────────────────
const LEAF_CHARS = ["🍃", "🍃", "🌿", "🍃", "🌱", "🍃", "🌿", "🍃"];

// ── Feature data ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon:    "👑",
    title:   "Admin Control",
    desc:    "Full farm control — employees, farmers, expenses, audit trail & reports",
    color:   "#2D6A4F",
    bg:      "#D8F3DC",
  },
  {
    icon:    "⚖️",
    title:   "Tea Collection",
    desc:    "BLE scale integration, batch tracking, plucker & farmer collection records",
    color:   "#1B4332",
    bg:      "#B7E4C7",
  },
  {
    icon:    "🏷️",
    title:   "Grading & Sales",
    desc:    "Grade A & B classification, price per kg, factory sales & revenue tracking",
    color:   "#40916C",
    bg:      "#D8F3DC",
  },
  {
    icon:    "📊",
    title:   "Live Reports",
    desc:    "Collection, financial, attendance, inventory & sales reports in real time",
    color:   "#1B4332",
    bg:      "#B7E4C7",
  },
  {
    icon:    "💳",
    title:   "Smart Payments",
    desc:    "Cash, Mpesa & bank payments with proof upload and status tracking",
    color:   "#2D6A4F",
    bg:      "#D8F3DC",
  },
  {
    icon:    "🔍",
    title:   "Full Audit Trail",
    desc:    "Every action logged — who, what, when and outcome across all roles",
    color:   "#40916C",
    bg:      "#B7E4C7",
  },
];

const ROLES = [
  { icon: "👑", label: "Admin",               color: "#2D6A4F" },
  { icon: "🧺", label: "Collector",           color: "#40916C" },
  { icon: "💼", label: "Sales Supervisor",    color: "#1B4332" },
  { icon: "📊", label: "Main Supervisor",     color: "#52B788" },
];

// ── Single falling leaf ───────────────────────────────────────────────────────
interface LeafProps {
  x:       number;
  delay:   number;
  size:    number;
  char:    string;
  speed:   number;
  swingAmp:number;
}

function FallingLeaf({ x, delay, size, char, speed, swingAmp }: LeafProps) {
  const y        = useRef(new Animated.Value(-60)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const swing    = useRef(new Animated.Value(0)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const swingRef = useRef<any>(null);
  const fallRef  = useRef<any>(null);

  useEffect(() => {
    // ── Swing runs INDEPENDENTLY in its own infinite loop ─────────────────
    // Separating it from the fall is the KEY fix — the fall's .start()
    // callback was never firing because Animated.parallel was waiting for
    // the infinite swing loop to finish (which it never did).
    const startSwing = () => {
      swingRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(swing, { toValue:  swingAmp, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
          Animated.timing(swing, { toValue: -swingAmp, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        ])
      );
      swingRef.current.start();
    };

    // ── Fall + spin + fade — restarts immediately when done = rain effect ─
    const startFall = (initialDelay: number) => {
      y.setValue(-60);
      rotation.setValue(0);
      opacity.setValue(0);

      fallRef.current = Animated.parallel([
        Animated.timing(y, {
          toValue:         height + 80,
          duration:        speed,
          delay:           initialDelay,
          useNativeDriver: true,
          easing:          Easing.linear,
        }),
        Animated.timing(rotation, {
          toValue:         360,
          duration:        speed,
          delay:           initialDelay,
          useNativeDriver: true,
          easing:          Easing.linear,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,    duration: 0,            delay: initialDelay, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.85, duration: 500,          useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.85, duration: speed - 1000, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 500,          useNativeDriver: true }),
        ]),
      ]);

      // When fall finishes → reset position → fall again immediately
      // No delay on repeat = continuous rain, never stops
      fallRef.current.start(({ finished }: { finished: boolean }) => {
        if (finished) startFall(0);
      });
    };

    startSwing();          // swing runs forever independently
    startFall(delay);      // first fall uses stagger delay for variety

    return () => {
      if (swingRef.current) swingRef.current.stop();
      if (fallRef.current)  fallRef.current.stop();
    };
  }, []);

  const spin = rotation.interpolate({
    inputRange:  [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={{
        position:  "absolute",
        left:      x,
        top:       0,
        transform: [
          { translateY: y },
          { translateX: swing },
          { rotate: spin },
        ],
        opacity,
      }}
    >
      <Text style={{ fontSize: size }}>{char}</Text>
    </Animated.View>
  );
}

// ── Generate leaves with varied params ───────────────────────────────────────
const LEAVES: LeafProps[] = Array.from({ length: 18 }, (_, i) => ({
  x:        Math.random() * (width - 40),
  delay:    Math.random() * 6000,
  size:     14 + Math.random() * 18,
  char:     LEAF_CHARS[i % LEAF_CHARS.length],
  speed:    7000 + Math.random() * 6000,
  swingAmp: 15 + Math.random() * 30,
}));

// ── Main Component ────────────────────────────────────────────────────────────
export default function OnboardingScreen({ navigation }: any) {
  const [page, setPage] = useState(0); // 0 = intro, 1 = features
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, delay: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, delay: 300, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [page]);

  const switchPage = (newPage: number) => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    setPage(newPage);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A2E1A" />

      {/* ── Falling leaves (always rendered behind content) ── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {LEAVES.map((leaf, i) => (
          <FallingLeaf key={i} {...leaf} />
        ))}
      </View>

      {/* ── Background gradient overlay ── */}
      <View style={styles.bgOverlay} pointerEvents="none" />

      {/* ── INTRO PAGE ── */}
      {page === 0 && (
        <Animated.View
          style={[styles.page, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {/* Logo / Badge */}
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🌿</Text>
            <Text style={styles.logoText}>TeaFarm Pro</Text>
          </View>

          {/* Main headline */}
          <Text style={styles.headline}>
            Your Entire{"\n"}
            <Text style={styles.headlineAccent}>Tea Farm</Text>{"\n"}
            In One App
          </Text>

          <Text style={styles.subHeadline}>
            From leaf to ledger — manage pluckers, farmers, grading,{"\n"}
            sales, payments and reports in real time.
          </Text>

          {/* Role pills */}
          <View style={styles.rolesRow}>
            {ROLES.map(r => (
              <View key={r.label} style={[styles.rolePill, { borderColor: r.color + "60" }]}>
                <Text style={styles.rolePillIcon}>{r.icon}</Text>
                <Text style={[styles.rolePillText, { color: r.color }]}>{r.label}</Text>
              </View>
            ))}
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            {[
              { val: "4",    lbl: "Roles" },
              { val: "BLE",  lbl: "Scale Sync" },
              { val: "100%", lbl: "Cloud" },
              { val: "Live", lbl: "Reports" },
            ].map(s => (
              <View key={s.lbl} style={styles.stripItem}>
                <Text style={styles.stripVal}>{s.val}</Text>
                <Text style={styles.stripLbl}>{s.lbl}</Text>
              </View>
            ))}
          </View>

          {/* Navigation */}
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.nextBtn} onPress={() => switchPage(1)} activeOpacity={0.88}>
              <Text style={styles.nextBtnText}>See Features →</Text>
            </TouchableOpacity>
          </View>

          {/* Page dots */}
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
          </View>
        </Animated.View>
      )}

      {/* ── FEATURES PAGE ── */}
      {page === 1 && (
        <Animated.View
          style={[styles.page, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          <Text style={styles.featuresTitle}>Everything You Need</Text>
          <Text style={styles.featuresSub}>Built for real Kenya tea farms</Text>

          <ScrollView
            style={styles.featuresScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.featuresScrollContent}
          >
            <View style={styles.featureGrid}>
              {FEATURES.map((f, i) => (
                <View
                  key={f.title}
                  style={[
                    styles.featureCard,
                    { backgroundColor: f.bg, borderColor: f.color + "30" },
                    i % 2 === 0 ? styles.featureCardLeft : styles.featureCardRight,
                  ]}
                >
                  <View style={[styles.featureIconWrap, { backgroundColor: f.color }]}>
                    <Text style={styles.featureIcon}>{f.icon}</Text>
                  </View>
                  <Text style={[styles.featureTitle, { color: f.color }]}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              ))}
            </View>

            {/* Built for */}
            <View style={styles.builtForCard}>
              <Text style={styles.builtForTitle}>☁️ Powered by Firebase</Text>
              <Text style={styles.builtForDesc}>
                Real-time cloud sync · Works on Android · Secure multi-role access · Offline-ready with auto-sync when reconnected
              </Text>
            </View>
          </ScrollView>

          {/* Navigation */}
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => switchPage(0)} activeOpacity={0.8}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.getStartedBtn}
              onPress={async () => {
                try {
                  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
                } catch {}
                navigation.replace("Login");
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.getStartedText}>Get Started 🌿</Text>
            </TouchableOpacity>
          </View>

          {/* Page dots */}
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: "#0A2E1A",
  },

  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 46, 26, 0.55)",
  },

  page: {
    flex:             1,
    paddingHorizontal: 24,
    paddingTop:       56,
    paddingBottom:    24,
    justifyContent:   "space-between",
  },

  // ── Intro page ──
  logoBadge: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    backgroundColor:"rgba(255,255,255,0.1)",
    alignSelf:      "flex-start",
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderRadius:   100,
    borderWidth:    1,
    borderColor:    "rgba(255,255,255,0.2)",
    marginBottom:   8,
  },
  logoEmoji: { fontSize: 22 },
  logoText:  { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },

  headline: {
    fontSize:   44,
    fontWeight: "900",
    color:      "#fff",
    lineHeight: 52,
    marginBottom: 16,
    letterSpacing: -1,
  },
  headlineAccent: {
    color: "#52B788",
  },

  subHeadline: {
    fontSize:   15,
    color:      "rgba(255,255,255,0.72)",
    lineHeight: 23,
    marginBottom: 24,
  },

  rolesRow: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           8,
    marginBottom:  24,
  },
  rolePill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               6,
    backgroundColor:   "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      100,
    borderWidth:       1,
  },
  rolePillIcon: { fontSize: 14 },
  rolePillText: { fontSize: 12, fontWeight: "700" },

  statsStrip: {
    flexDirection:   "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius:    16,
    paddingVertical: 16,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.12)",
    marginBottom:    24,
  },
  stripItem: { flex: 1, alignItems: "center" },
  stripVal:  { fontSize: 18, fontWeight: "900", color: "#52B788" },
  stripLbl:  { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 },

  // ── Features page ──
  featuresTitle: {
    fontSize:     28,
    fontWeight:   "900",
    color:        "#fff",
    marginBottom: 4,
  },
  featuresSub: {
    fontSize:     14,
    color:        "rgba(255,255,255,0.6)",
    marginBottom: 16,
  },
  featuresScroll:        { flex: 1 },
  featuresScrollContent: { paddingBottom: 8 },

  featureGrid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           10,
    marginBottom:  12,
  },
  featureCard: {
    width:        (width - 48 - 10) / 2,
    borderRadius: 16,
    padding:      14,
    borderWidth:  1,
    ...({ elevation: 2 } as any),
  },
  featureCardLeft:  {},
  featureCardRight: { marginTop: 20 },

  featureIconWrap: {
    width:         40,
    height:        40,
    borderRadius:  12,
    alignItems:    "center",
    justifyContent:"center",
    marginBottom:  10,
  },
  featureIcon:  { fontSize: 20 },
  featureTitle: { fontSize: 13, fontWeight: "800", marginBottom: 5 },
  featureDesc:  { fontSize: 11, color: "#2D4A38", lineHeight: 16 },

  builtForCard: {
    backgroundColor: "rgba(82,183,136,0.15)",
    borderRadius:    16,
    padding:         16,
    borderWidth:     1,
    borderColor:     "rgba(82,183,136,0.3)",
    marginBottom:    8,
  },
  builtForTitle: { fontSize: 14, fontWeight: "800", color: "#52B788", marginBottom: 6 },
  builtForDesc:  { fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 20 },

  // ── Navigation ──
  navRow: {
    flexDirection:  "row",
    gap:            10,
    marginTop:      12,
  },

  nextBtn: {
    flex:           1,
    backgroundColor:"#52B788",
    borderRadius:   14,
    height:         54,
    alignItems:     "center",
    justifyContent: "center",
    shadowColor:    "#52B788",
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.4,
    shadowRadius:   12,
    elevation:      8,
  },
  nextBtnText: {
    fontSize:   17,
    fontWeight: "900",
    color:      "#0A2E1A",
    letterSpacing: 0.3,
  },

  backBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius:    14,
    height:          54,
    paddingHorizontal: 20,
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.15)",
  },
  backBtnText: {
    fontSize:   15,
    fontWeight: "700",
    color:      "rgba(255,255,255,0.8)",
  },

  getStartedBtn: {
    flex:           1,
    backgroundColor:"#52B788",
    borderRadius:   14,
    height:         54,
    alignItems:     "center",
    justifyContent: "center",
    shadowColor:    "#52B788",
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.4,
    shadowRadius:   12,
    elevation:      8,
  },
  getStartedText: {
    fontSize:   17,
    fontWeight: "900",
    color:      "#0A2E1A",
    letterSpacing: 0.3,
  },

  // ── Page dots ──
  dots: {
    flexDirection:  "row",
    justifyContent: "center",
    gap:            6,
    marginTop:      12,
  },
  dot: {
    width:         8,
    height:        8,
    borderRadius:  4,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: "#52B788",
    width:           24,
  },
});