// ─── Sales Dashboard v2 — TeaFarm Pro ────────────────────────────────────────
// Reads from GRADINGS (graded stock) + SALES (actual transactions)
// Correct flow: Collections → Gradings → Sales
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar, Alert,
} from "react-native";
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc,
} from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { colors, fonts, spacing, radius, shadows } from "../../theme";
import { logoutUser, COLLECTIONS } from "../../firebase/auth";
import { useLoader } from "../../context/LoaderContext";
import TeaLoader from "../../components/TeaLoader";

const db   = getFirestore();
const auth = getAuth();

interface DashStats {
  // Stock pipeline
  totalCollectedKg:  number;
  totalGradedOutKg:  number;
  rawStockKg:        number; // collected but not yet graded
  gradedAvailableA:  number; // graded A not yet sold
  gradedAvailableB:  number; // graded B not yet sold
  // Sales
  totalSoldKg:       number;
  totalRevenue:      number;
  totalSalesCount:   number;
  todaySoldKg:       number;
  todayRevenue:      number;
  // Grade totals (all time)
  totalGradeA:       number;
  totalGradeB:       number;
  totalRejected:     number;
  avgPricePerKg:     number;
}

interface RecentSale {
  id: string; gradeA_kg: number; gradeB_kg: number;
  totalAmount: number; buyerName: string; date: string; createdAt: any;
}

export default function SalesDashboard({ navigation }: any) {
  const { showLoader, hideLoader } = useLoader();
  const [stats,      setStats]      = useState<DashStats | null>(null);
  const [recent,     setRecent]     = useState<RecentSale[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName,   setUserName]   = useState("Sales Supervisor");
  const [orgName,    setOrgName]    = useState("My Farm");

  const load = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid; if (!uid) return;
      const uSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
      if (!uSnap.exists()) return;
      const u = uSnap.data()!;
      const oid = u.organizationId || "";
      setUserName(u.name || "Sales Supervisor");
      if (!oid) return;

      const oSnap = await getDoc(doc(db, COLLECTIONS.ORGANIZATIONS, oid));
      if (oSnap.exists()) setOrgName(oSnap.data()!.farmName || "My Farm");

      const [collSnap, gradSnap, saleSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.COLLECTIONS), where("organizationId","==",oid))),
        getDocs(query(collection(db, COLLECTIONS.GRADINGS),    where("organizationId","==",oid))),
        getDocs(query(collection(db, COLLECTIONS.SALES),       where("organizationId","==",oid))),
      ]);

      // ── Step 1: total collected ──
      let totalCollectedKg = 0;
      collSnap.docs.forEach(d => { totalCollectedKg += d.data().weightKg || 0; });

      // ── Step 2: graded totals ──
      let gA=0, gB=0, gR=0;
      gradSnap.docs.forEach(d => {
        gA += d.data().gradeA_kg   || 0;
        gB += d.data().gradeB_kg   || 0;
        gR += d.data().rejected_kg || 0;
      });
      const totalGradedOutKg = gA + gB + gR;
      const rawStockKg = Math.max(0, totalCollectedKg - totalGradedOutKg);

      // ── Step 3: sold from graded stock ──
      const today = new Date().toISOString().split("T")[0];
      let soldA=0, soldB=0, totalRev=0, todayKg=0, todayRev=0;
      saleSnap.docs.forEach(d => {
        const s = d.data();
        soldA    += s.gradeA_kg   || 0;
        soldB    += s.gradeB_kg   || 0;
        totalRev += s.totalAmount || 0;
        if (s.date === today) {
          todayKg  += (s.gradeA_kg || 0) + (s.gradeB_kg || 0);
          todayRev += s.totalAmount || 0;
        }
      });

      const totalSoldKg    = soldA + soldB;
      const gradedAvailableA = Math.max(0, gA - soldA);
      const gradedAvailableB = Math.max(0, gB - soldB);
      const avgPricePerKg  = totalSoldKg > 0 ? Math.round((totalRev / totalSoldKg) * 100) / 100 : 0;

      setStats({
        totalCollectedKg:  Math.round(totalCollectedKg  * 10) / 10,
        totalGradedOutKg:  Math.round(totalGradedOutKg  * 10) / 10,
        rawStockKg:        Math.round(rawStockKg         * 10) / 10,
        gradedAvailableA:  Math.round(gradedAvailableA  * 10) / 10,
        gradedAvailableB:  Math.round(gradedAvailableB  * 10) / 10,
        totalSoldKg:       Math.round(totalSoldKg        * 10) / 10,
        totalRevenue:      totalRev,
        totalSalesCount:   saleSnap.size,
        todaySoldKg:       Math.round(todayKg            * 10) / 10,
        todayRevenue:      Math.round(todayRev           * 100) / 100,
        totalGradeA:       Math.round(gA                 * 10) / 10,
        totalGradeB:       Math.round(gB                 * 10) / 10,
        totalRejected:     Math.round(gR                 * 10) / 10,
        avgPricePerKg,
      });

      const sorted = saleSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as RecentSale))
        .sort((a,b) => (b.createdAt?.toDate?.()?.getTime()||0) - (a.createdAt?.toDate?.()?.getTime()||0))
        .slice(0, 5);
      setRecent(sorted);

    } catch (e: any) { console.log("Sales dashboard v2 error:", e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    Alert.alert("Sign Out","Are you sure?",[
      { text:"Cancel",style:"cancel" },
      { text:"Sign Out",style:"destructive", onPress:async()=>{
        showLoader("Signing out..."); try{ await logoutUser(); navigation.replace("Login"); } finally{ hideLoader(); }
      }},
    ]);
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h<12?"Good Morning":h<17?"Good Afternoon":"Good Evening";
  };

  if (loading) return <TeaLoader message="Loading Sales Dashboard..." />;

  const totalCol   = stats?.totalCollectedKg ?? 0;
  const rawPct     = totalCol > 0 ? Math.min(100, Math.round((stats!.rawStockKg / totalCol) * 100)) : 0;
  const gradedPct  = totalCol > 0 ? Math.min(100, Math.round(((stats!.gradedAvailableA + stats!.gradedAvailableB) / totalCol) * 100)) : 0;
  const soldPct    = totalCol > 0 ? Math.min(100, Math.round((stats!.totalSoldKg / totalCol) * 100)) : 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.salesColor} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.hTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.hGreet}>{greeting()} 👋</Text>
            <Text style={s.hName}>{userName}</Text>
            <Text style={s.hOrg}>🌿 {orgName}</Text>
          </View>
          <View style={s.hRight}>
            <View style={s.roleBadge}><Text style={s.roleTxt}>💼 Sales</Text></View>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Text style={s.logoutTxt}>⎋</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* today strip */}
        <View style={s.todayRow}>
          {[
            { lbl:"Today Sold",    val:`${stats?.todaySoldKg??0} kg` },
            { lbl:"Today Revenue", val:`KSh ${(stats?.todayRevenue??0).toLocaleString()}` },
            { lbl:"Ready to Sell", val:`${((stats?.gradedAvailableA??0)+(stats?.gradedAvailableB??0)).toFixed(1)} kg`, highlight:true },
          ].map((item, i, arr) => (
            <React.Fragment key={item.lbl}>
              <View style={s.todayItem}>
                <Text style={s.todayLbl}>{item.lbl}</Text>
                <Text style={[s.todayVal, item.highlight && { color: colors.warning }]}>{item.val}</Text>
              </View>
              {i < arr.length-1 && <View style={s.todayDiv}/>}
            </React.Fragment>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} colors={[colors.salesColor]} tintColor={colors.salesColor}/>}>

        {/* REVENUE HERO */}
        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLbl}>Total Revenue</Text>
            <Text style={s.heroVal}>KSh {(stats?.totalRevenue??0).toLocaleString()}</Text>
            <Text style={s.heroSub}>{stats?.totalSalesCount??0} sales · avg KSh {stats?.avgPricePerKg??0}/kg</Text>
          </View>
          <View style={s.heroIcon}><Text style={{ fontSize: 40 }}>💰</Text></View>
        </View>

        {/* TEA PIPELINE — the key new section */}
        <Text style={s.secTitle}>🌿 Tea Pipeline</Text>
        <View style={s.pipelineCard}>
          <Text style={s.pipelineSubtitle}>From collection to sale</Text>

          {/* Progress bar showing pipeline */}
          <View style={s.pipeBar}>
            <View style={[s.pipeSegSold,  { flex: soldPct    || 0 }]} />
            <View style={[s.pipeSegGraded,{ flex: gradedPct  || 0 }]} />
            <View style={[s.pipeSegRaw,   { flex: rawPct     || 0 }]} />
            <View style={[s.pipeSegEmpty, { flex: Math.max(0, 100 - soldPct - gradedPct - rawPct) }]} />
          </View>

          <View style={s.pipeLegend}>
            {[
              { c:colors.salesColor, l:`Sold ${soldPct}%` },
              { c:colors.success,    l:`Graded (avail) ${gradedPct}%` },
              { c:colors.warning,    l:`Raw Stock ${rawPct}%` },
            ].map(x=>(
              <View key={x.l} style={{ flexDirection:"row",alignItems:"center",gap:5 }}>
                <View style={{ width:10,height:10,borderRadius:5,backgroundColor:x.c }}/>
                <Text style={{ fontSize:10,color:colors.textMuted,fontWeight:"600" }}>{x.l}</Text>
              </View>
            ))}
          </View>

          {/* 3 pipeline stages */}
          <View style={s.pipeStages}>
            <View style={s.pipeStage}>
              <View style={[s.pipeStageNum, { backgroundColor: colors.warning + "20" }]}>
                <Text style={[s.pipeStageNumTxt, { color: colors.warning }]}>📦</Text>
              </View>
              <Text style={[s.pipeStageKg, { color: colors.warning }]}>{stats?.rawStockKg ?? 0} kg</Text>
              <Text style={s.pipeStageLbl}>Raw Stock</Text>
              <Text style={s.pipeStageAction}>Needs grading</Text>
            </View>
            <View style={s.pipeArrow}><Text style={s.pipeArrowTxt}>→</Text></View>
            <View style={s.pipeStage}>
              <View style={[s.pipeStageNum, { backgroundColor: colors.success + "20" }]}>
                <Text style={[s.pipeStageNumTxt, { color: colors.success }]}>🏷️</Text>
              </View>
              <Text style={[s.pipeStageKg, { color: colors.success }]}>
                {((stats?.gradedAvailableA??0) + (stats?.gradedAvailableB??0)).toFixed(1)} kg
              </Text>
              <Text style={s.pipeStageLbl}>Graded — Ready</Text>
              <Text style={s.pipeStageAction}>A: {stats?.gradedAvailableA??0}kg · B: {stats?.gradedAvailableB??0}kg</Text>
            </View>
            <View style={s.pipeArrow}><Text style={s.pipeArrowTxt}>→</Text></View>
            <View style={s.pipeStage}>
              <View style={[s.pipeStageNum, { backgroundColor: colors.salesColor + "20" }]}>
                <Text style={[s.pipeStageNumTxt, { color: colors.salesColor }]}>💰</Text>
              </View>
              <Text style={[s.pipeStageKg, { color: colors.salesColor }]}>{stats?.totalSoldKg ?? 0} kg</Text>
              <Text style={s.pipeStageLbl}>Sold</Text>
              <Text style={s.pipeStageAction}>KSh {(stats?.totalRevenue??0).toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* GRADE BREAKDOWN */}
        <Text style={s.secTitle}>📊 Grade Breakdown</Text>
        <View style={s.gradeRow}>
          {[
            { icon:"🅰️", val:stats?.totalGradeA??0, lbl:"Grade A", sub:"Premium", bg:colors.successLight, c:colors.success },
            { icon:"🅱️", val:stats?.totalGradeB??0, lbl:"Grade B", sub:"Standard", bg:colors.warningLight, c:colors.warning },
            { icon:"⚖️", val:stats?.totalSoldKg??0, lbl:"Total Sold",sub:"Revenue", bg:colors.primaryPale, c:colors.primary },
          ].map(g=>(
            <View key={g.lbl} style={[s.gradeCard,{backgroundColor:g.bg}]}>
              <Text style={s.gradeIcon}>{g.icon}</Text>
              <Text style={[s.gradeVal,{color:g.c}]}>{g.val} kg</Text>
              <Text style={s.gradeLbl}>{g.lbl}</Text>
              <Text style={s.gradeSub}>{g.sub}</Text>
            </View>
          ))}
        </View>

        {/* QUICK ACTIONS */}
        <Text style={s.secTitle}>⚡ Quick Actions</Text>
        <View style={s.actionsRow}>
          <TouchableOpacity style={[s.actionCard,{backgroundColor:colors.salesLight}]}
            onPress={()=>navigation.navigate("Grading")} activeOpacity={0.8}>
            <View style={[s.actionIconWrap,{backgroundColor:colors.salesColor}]}>
              <Text style={s.actionIcon}>🏷️</Text>
            </View>
            <Text style={[s.actionLbl,{color:colors.salesColor}]}>Grade Tea</Text>
            <Text style={s.actionDesc}>Split raw stock into A/B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionCard,{backgroundColor:colors.successLight}]}
            onPress={()=>navigation.navigate("Sales")} activeOpacity={0.8}>
            <View style={[s.actionIconWrap,{backgroundColor:colors.success}]}>
              <Text style={s.actionIcon}>📋</Text>
            </View>
            <Text style={[s.actionLbl,{color:colors.success}]}>Sales Report</Text>
            <Text style={s.actionDesc}>View all transactions</Text>
          </TouchableOpacity>
        </View>

        {/* RECENT SALES */}
        <Text style={s.secTitle}>🕐 Recent Sales</Text>
        {recent.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={{ fontSize: 48, marginBottom: 10 }}>📋</Text>
            <Text style={s.emptyTitle}>No sales yet</Text>
            <Text style={s.emptySub}>Grade tea then sell a batch to see sales here</Text>
          </View>
        ) : (
          <View style={s.recentCard}>
            {recent.map((sale, idx) => (
              <View key={sale.id}>
                <View style={s.saleRow}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={s.saleDate}>{sale.date || "—"}</Text>
                    <Text style={s.saleBuyer}>🏭 {sale.buyerName || "Factory"}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    {(sale.gradeA_kg||0)>0&&<Text style={s.saleA}>A: {sale.gradeA_kg}kg</Text>}
                    {(sale.gradeB_kg||0)>0&&<Text style={s.saleB}>B: {sale.gradeB_kg}kg</Text>}
                  </View>
                  <Text style={s.saleAmt}>KSh {(sale.totalAmount||0).toLocaleString()}</Text>
                </View>
                {idx < recent.length-1 && <View style={{ height:1, backgroundColor:colors.divider }}/>}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:colors.background},
  header:{backgroundColor:colors.salesColor,paddingTop:48,paddingHorizontal:spacing.md,paddingBottom:spacing.md,borderBottomLeftRadius:24,borderBottomRightRadius:24,...shadows.lg},
  hTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:spacing.md},
  hGreet:{fontSize:fonts.sizes.sm,color:"rgba(255,255,255,0.75)",fontWeight:"500"},
  hName:{fontSize:fonts.sizes.xl,color:"#fff",fontWeight:"900",marginTop:2},
  hOrg:{fontSize:fonts.sizes.sm,color:"rgba(255,255,255,0.8)",marginTop:2},
  hRight:{alignItems:"flex-end",gap:8},
  roleBadge:{backgroundColor:"rgba(255,255,255,0.2)",paddingHorizontal:12,paddingVertical:5,borderRadius:radius.full,borderWidth:1,borderColor:"rgba(255,255,255,0.3)"},
  roleTxt:{color:"#fff",fontSize:fonts.sizes.xs,fontWeight:"700"},
  logoutBtn:{backgroundColor:"rgba(255,255,255,0.15)",width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"rgba(255,255,255,0.3)"},
  logoutTxt:{fontSize:18,color:"#fff"},
  todayRow:{backgroundColor:"rgba(255,255,255,0.15)",borderRadius:radius.lg,flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingVertical:14,borderWidth:1,borderColor:"rgba(255,255,255,0.2)"},
  todayItem:{alignItems:"center",flex:1},
  todayLbl:{fontSize:fonts.sizes.xs,color:"rgba(255,255,255,0.7)",textAlign:"center",marginBottom:4},
  todayVal:{fontSize:fonts.sizes.md,color:"#fff",fontWeight:"800",textAlign:"center"},
  todayDiv:{width:1,height:32,backgroundColor:"rgba(255,255,255,0.25)"},
  content:{paddingHorizontal:spacing.md,paddingTop:spacing.lg},
  secTitle:{fontSize:fonts.sizes.md,fontWeight:"800",color:colors.textPrimary,marginBottom:spacing.sm,marginTop:spacing.xs},
  hero:{backgroundColor:colors.salesColor,borderRadius:radius.xl,padding:spacing.lg,flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:spacing.lg,...shadows.lg},
  heroLbl:{fontSize:fonts.sizes.sm,color:"rgba(255,255,255,0.75)",fontWeight:"600",marginBottom:4},
  heroVal:{fontSize:28,color:"#fff",fontWeight:"900",marginBottom:4},
  heroSub:{fontSize:fonts.sizes.xs,color:"rgba(255,255,255,0.7)"},
  heroIcon:{width:64,height:64,backgroundColor:"rgba(255,255,255,0.15)",borderRadius:32,alignItems:"center",justifyContent:"center"},
  pipelineCard:{backgroundColor:colors.surface,borderRadius:radius.xl,padding:spacing.md,marginBottom:spacing.md,...shadows.md},
  pipelineSubtitle:{fontSize:fonts.sizes.xs,color:colors.textMuted,marginBottom:spacing.sm},
  pipeBar:{height:14,borderRadius:7,backgroundColor:colors.border,flexDirection:"row",overflow:"hidden",marginBottom:8},
  pipeSegSold:{backgroundColor:colors.salesColor},
  pipeSegGraded:{backgroundColor:colors.success},
  pipeSegRaw:{backgroundColor:colors.warning},
  pipeSegEmpty:{},
  pipeLegend:{flexDirection:"row",flexWrap:"wrap",gap:spacing.sm,marginBottom:spacing.md},
  pipeStages:{flexDirection:"row",alignItems:"center"},
  pipeStage:{flex:1,alignItems:"center",backgroundColor:colors.background,borderRadius:radius.md,padding:spacing.sm},
  pipeStageNum:{width:40,height:40,borderRadius:20,alignItems:"center",justifyContent:"center",marginBottom:6},
  pipeStageNumTxt:{fontSize:20},
  pipeStageKg:{fontSize:fonts.sizes.md,fontWeight:"900"},
  pipeStageLbl:{fontSize:10,color:colors.textPrimary,fontWeight:"700",marginTop:2,textAlign:"center"},
  pipeStageAction:{fontSize:9,color:colors.textMuted,marginTop:2,textAlign:"center"},
  pipeArrow:{paddingHorizontal:4},
  pipeArrowTxt:{fontSize:16,color:colors.textMuted},
  gradeRow:{flexDirection:"row",gap:spacing.sm,marginBottom:spacing.md},
  gradeCard:{flex:1,borderRadius:radius.lg,padding:spacing.sm,alignItems:"center",...shadows.sm},
  gradeIcon:{fontSize:24,marginBottom:6},
  gradeVal:{fontSize:fonts.sizes.lg,fontWeight:"900",textAlign:"center"},
  gradeLbl:{fontSize:fonts.sizes.xs,fontWeight:"700",color:colors.textPrimary,marginTop:2},
  gradeSub:{fontSize:10,color:colors.textMuted,marginTop:1},
  actionsRow:{flexDirection:"row",gap:spacing.sm,marginBottom:spacing.md},
  actionCard:{flex:1,borderRadius:radius.lg,padding:spacing.md,...shadows.sm},
  actionIconWrap:{width:52,height:52,borderRadius:26,alignItems:"center",justifyContent:"center",marginBottom:10},
  actionIcon:{fontSize:26},
  actionLbl:{fontSize:fonts.sizes.md,fontWeight:"800",marginBottom:4},
  actionDesc:{fontSize:11,color:colors.textMuted},
  recentCard:{backgroundColor:colors.surface,borderRadius:radius.lg,padding:spacing.md,marginBottom:spacing.md,...shadows.md},
  saleRow:{flexDirection:"row",alignItems:"center",paddingVertical:10},
  saleDate:{fontSize:fonts.sizes.xs,fontWeight:"700",color:colors.textPrimary},
  saleBuyer:{fontSize:10,color:colors.textMuted,marginTop:2},
  saleA:{fontSize:11,color:colors.success,fontWeight:"700"},
  saleB:{fontSize:11,color:colors.warning,fontWeight:"700"},
  saleAmt:{fontSize:fonts.sizes.sm,fontWeight:"900",color:colors.salesColor,textAlign:"right"},
  emptyCard:{backgroundColor:colors.surface,borderRadius:radius.lg,padding:spacing.xl,alignItems:"center",marginBottom:spacing.md,...shadows.sm},
  emptyTitle:{fontSize:fonts.sizes.md,fontWeight:"800",color:colors.textPrimary},
  emptySub:{fontSize:fonts.sizes.sm,color:colors.textMuted,marginTop:4,textAlign:"center"},
});