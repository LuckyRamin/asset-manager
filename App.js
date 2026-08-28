import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Alert, Dimensions, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { Feather } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

const screenWidth = Dimensions.get("window").width;
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GRAMS_PER_POUND = 453.59237;

const ASSET_DEF = [
  { id: 'gold18', name: 'طلا ۱۸ عیار', unit: 'گرم', type: 'gold', purity: 0.75, icon: 'sun', color: '#f59e0b' },
  { id: 'silver999', name: 'نقره ۹۹۹', unit: 'گرم', type: 'silver', purity: 0.999, icon: 'disc', color: '#94a3b8' },
  { id: 'copper999', name: 'مس (۹۹.۹٪)', unit: 'گرم', type: 'copper', purity: 1.0, icon: 'box', color: '#d97706' },
  { id: 'usdt', name: 'تتر / دلار', unit: 'تتر', type: 'usd', purity: 1.0, icon: 'dollar-sign', color: '#10b981' }
];

export default function App() {
  const [qty, setQty] = useState({ gold18: '0', silver999: '0', copper999: '0', usdt: '0' });
  const [pricesUSD, setPricesUSD] = useState({ gold: 2400, silver: 28.5, copper: 4.2 });
  const [usdtRate, setUsdtRate] = useState({ price: 65000, source: 'پشتیبان' });
  const [history, setHistory] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const viewShotRef = useRef();

  useEffect(() => {
    loadData();
    fetchAllPrices();
  }, []);

  const loadData = async () => {
    try {
      const q = await AsyncStorage.getItem('app_qty_v10');
      if (q) setQty(JSON.parse(q));
      const h = await AsyncStorage.getItem('app_history');
      if (h) setHistory(JSON.parse(h));
    } catch (e) { }
  };

  const toEnglishDigits = (str) => {
    if (!str) return '0';
    return str.toString()
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[^0-9.]/g, '');
  };

  const fetchAllPrices = async () => {
    setIsRefreshing(true);
    try {
      const nobitexRes = await fetch("https://api.nobitex.ir/v2/orderbook/USDTIRT");
      const nobitexData = await nobitexRes.json();
      const tPrice = nobitexData?.bids?.[0]?.[0] ? Math.round(Number(nobitexData.bids[0][0]) / 10) : 65000;
      setUsdtRate({ price: tPrice, source: 'نوبیتکس' });

      let g = 2400, s = 28.5;
      try {
        const [gRes, sRes] = await Promise.all([
          fetch('https://api.gold-api.com/price/XAU'),
          fetch('https://api.gold-api.com/price/XAG')
        ]);
        if (gRes.ok) g = (await gRes.json()).price;
        if (sRes.ok) s = (await sRes.json()).price;
      } catch (e) { }
      
      setPricesUSD(prev => ({ ...prev, gold: g, silver: s }));
    } catch (e) {
      Alert.alert('خطا', 'عدم ارتباط با سرور قیمت');
    }
    setIsRefreshing(false);
  };

  const saveQty = async (id, val) => {
    const newQty = { ...qty, [id]: val };
    setQty(newQty);
    await AsyncStorage.setItem('app_qty_v10', JSON.stringify(newQty));
  };

  const saveHistorySnapshot = async () => {
    const today = new Date().toISOString().split("T")[0];
    let newHistory = [...history];
    const existingIndex = newHistory.findIndex(item => item.date === today);
    if (existingIndex > -1) {
      newHistory[existingIndex].value = grandTotalToman;
    } else {
      newHistory.push({ date: today, value: grandTotalToman });
    }
    if (newHistory.length > 30) newHistory.shift();
    setHistory(newHistory);
    await AsyncStorage.setItem('app_history', JSON.stringify(newHistory));
    Alert.alert("ثبت شد", "ارزش امروز در نمودار ذخیره شد.");
  };

  const exportBackup = async () => {
    try {
      const backupData = JSON.stringify({ assets: qty, history });
      const fileUri = FileSystem.cacheDirectory + "AssetBackup.json";
      await FileSystem.writeAsStringAsync(fileUri, backupData);
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("خطا", "اشتراک‌گذاری پشتیبانی نمی‌شود.");
      }
    } catch (e) {
      Alert.alert("خطا", "ساخت فایل پشتیبان ناموفق بود.");
    }
  };

  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;
      
      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const parsed = JSON.parse(fileContent);
      
      if (parsed.assets && parsed.history) {
        setQty(parsed.assets);
        setHistory(parsed.history);
        await AsyncStorage.setItem('app_qty_v10', JSON.stringify(parsed.assets));
        await AsyncStorage.setItem('app_history', JSON.stringify(parsed.history));
        Alert.alert("موفق", "داده‌ها بازیابی شدند.");
      } else {
        Alert.alert("خطا", "فایل پشتیبان نامعتبر است.");
      }
    } catch (e) {
      Alert.alert("خطا", "مشکل در بازیابی داده‌ها.");
    }
  };

  const shareSnapshot = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert('خطا', 'مشکل در تولید عکس');
    }
  };

  let grandTotalToman = 0;
  const breakdown = ASSET_DEF.map(asset => {
    let priceUSD = 0;
    if (asset.type === 'gold') priceUSD = (pricesUSD.gold / GRAMS_PER_TROY_OUNCE) * asset.purity;
    else if (asset.type === 'silver') priceUSD = (pricesUSD.silver / GRAMS_PER_TROY_OUNCE) * asset.purity;
    else if (asset.type === 'copper') priceUSD = (pricesUSD.copper / GRAMS_PER_POUND);
    else if (asset.type === 'usd') priceUSD = 1.0;

    const priceToman = priceUSD * usdtRate.price;
    const amount = parseFloat(toEnglishDigits(qty[asset.id])) || 0;
    const totalVal = amount * priceToman;
    grandTotalToman += totalVal;

    return { ...asset, priceUSD, priceToman, totalVal };
  });

  const grandTotalUSD = usdtRate.price > 0 ? (grandTotalToman / usdtRate.price) : 0;
  
  const pieData = breakdown.filter(b => b.totalVal > 0).map(b => ({
    name: b.name, population: b.totalVal, color: b.color, legendFontColor: '#94a3b8', legendFontSize: 11
  }));

  return (
    <ScrollView style={styles.bg}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
          <View style={styles.iconBox}><Feather name="briefcase" size={20} color="#fff" /></View>
          <View style={{ marginRight: 10 }}>
            <Text style={styles.headerTitle}>داشبورد هوشمند دارایی</Text>
            <Text style={styles.headerSub}>نسخه آفلاین موبایل</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row-reverse' }}>
          <TouchableOpacity onPress={shareSnapshot} style={styles.btnSmallIcon}>
            <Feather name="camera" size={16} color="#10b981" />
          </TouchableOpacity>
          <TouchableOpacity onPress={fetchAllPrices} style={[styles.btnSmallIcon, { marginRight: 8 }]}>
            {isRefreshing ? <ActivityIndicator size="small" color="#0ea5e9" /> : <Feather name="refresh-cw" size={16} color="#0ea5e9" />}
          </TouchableOpacity>
        </View>
      </View>

      <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.9 }} style={{ backgroundColor: '#020617' }}>
        <View style={[styles.card, { borderRightWidth: 4, borderRightColor: '#10b981', marginHorizontal: 15, marginTop: 15 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>نرخ زنده تتر</Text>
            <View style={styles.dot} />
          </View>
          <View style={[styles.rowReverse, { alignItems: 'baseline', marginTop: 10 }]}>
            <Text style={styles.tetherRate}>{usdtRate.price.toLocaleString()}</Text>
            <Text style={styles.unitText}> تومان</Text>
          </View>
          <Text style={styles.sourceText}>منبع: {usdtRate.source}</Text>
        </View>

        <View style={[styles.card, { borderRightWidth: 4, borderRightColor: '#0ea5e9', marginHorizontal: 15 }]}>
          <Text style={styles.cardTitle}>ارزش کل دارایی‌ها</Text>
          <View style={[styles.rowReverse, { alignItems: 'baseline', marginTop: 10 }]}>
            <Text style={styles.totalValToman}>{Math.round(grandTotalToman).toLocaleString()}</Text>
            <Text style={styles.unitText}> تومان</Text>
          </View>
          <Text style={styles.totalValUSD}>$ {grandTotalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</Text>
        </View>
      </ViewShot>

      <View style={styles.gridContainer}>
        {breakdown.map(b => (
          <View key={b.id} style={[styles.gridCard, { borderTopColor: b.color }]}>
            <Text style={styles.gridName}>{b.name}</Text>
            <Text style={styles.gridToman}>{Math.round(b.priceToman).toLocaleString()} <Text style={{fontSize: 9}}>تومان</Text></Text>
            <Text style={styles.gridUsd}>${b.priceUSD < 1 ? b.priceUSD.toFixed(3) : b.priceUSD.toFixed(1)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { marginHorizontal: 15 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 15 }]}>موجودی دارایی شما</Text>
        {ASSET_DEF.map(a => (
          <View key={a.id} style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{a.name} ({a.unit})</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="numeric" 
              value={qty[a.id]} 
              onChangeText={(v) => saveQty(a.id, v)} 
              placeholder="0" 
              placeholderTextColor="#475569"
            />
          </View>
        ))}
        <TouchableOpacity style={styles.btnAction} onPress={saveHistorySnapshot}>
          <Text style={styles.btnActionText}>ثبت در نمودار تاریخچه</Text>
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 10 }}>
          <TouchableOpacity style={[styles.btnAction, { flex: 1, marginLeft: 5, backgroundColor: '#334155', padding: 10 }]} onPress={exportBackup}>
            <Text style={styles.btnActionText}>خروجی بک‌آپ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnAction, { flex: 1, marginRight: 5, backgroundColor: '#1e293b', padding: 10 }]} onPress={importBackup}>
            <Text style={styles.btnActionText}>بازیابی بک‌آپ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { marginHorizontal: 15 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 10 }]}>پراکندگی ارزش</Text>
        {pieData.length > 0 ? (
          <PieChart
            data={pieData}
            width={screenWidth - 60}
            height={180}
            chartConfig={{ color: () => `rgba(255, 255, 255, 1)` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"15"}
            absolute
          />
        ) : <Text style={{ color: '#475569', textAlign: 'center', marginVertical: 20 }}>بدون موجودی</Text>}
      </View>

      <View style={[styles.card, { marginHorizontal: 15, marginBottom: 40 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 10 }]}>روند پیشرفت</Text>
        <LineChart
          data={{
            labels: history.length > 0 ? history.map(h => h.date.slice(-5)) : ["-"],
            datasets: [{ data: history.length > 0 ? history.map(h => h.value) : [0] }]
          }}
          width={screenWidth - 60}
          height={200}
          chartConfig={{
            backgroundColor: "#0f172a",
            backgroundGradientFrom: "#0f172a",
            backgroundGradientTo: "#0f172a",
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
            propsForDots: { r: "4", strokeWidth: "2", stroke: "#0ea5e9" }
          }}
          bezier
          style={{ borderRadius: 12 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'rgba(15, 23, 42, 0.9)', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold' },
  headerSub: { color: '#94a3b8', fontSize: 10 },
  btnSmallIcon: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(30, 41, 59, 0.8)', borderWidth: 1, borderColor: '#334155' },
  card: { backgroundColor: '#0f172a', padding: 16, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#1e293b' },
  rowBetween: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  cardTitle: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
  tetherRate: { color: '#10b981', fontSize: 32, fontWeight: '900' },
  totalValToman: { color: '#f8fafc', fontSize: 32, fontWeight: '900' },
  unitText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  totalValUSD: { color: '#10b981', fontSize: 14, fontWeight: 'bold', marginTop: 4, textAlign: 'right' },
  sourceText: { color: '#475569', fontSize: 10, marginTop: 8, textAlign: 'right' },
  gridContainer: { flexDirection: 'row-reverse', flexWrap: 'wrap', paddingHorizontal: 15, justifyContent: 'space-between', marginBottom: 15 },
  gridCard: { width: '48%', backgroundColor: '#0f172a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', borderTopWidth: 3, marginBottom: 10 },
  gridName: { color: '#cbd5e1', fontSize: 11, fontWeight: 'bold', textAlign: 'right', marginBottom: 6 },
  gridToman: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  gridUsd: { color: '#10b981', fontSize: 11, textAlign: 'right', marginTop: 2 },
  inputContainer: { marginBottom: 12 },
  inputLabel: { color: '#94a3b8', fontSize: 11, marginBottom: 4, textAlign: 'right' },
  input: { backgroundColor: '#1e293b', color: '#f8fafc', borderRadius: 10, padding: 10, textAlign: 'left', borderWidth: 1, borderColor: '#334155' },
  btnAction: { backgroundColor: '#0ea5e9', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnActionText: { color: '#fff', fontSize: 13, fontWeight: 'bold' }
});
