import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Plus, Trash2, QrCode, Share, CheckCircle2, Search } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface CatalogueItem {
  barcode: string;
  item_name: string;
  available_quantity: number;
}

interface CartItem {
  barcode: string;
  product_name: string;
  quantity: number;
  available_quantity: number;
  unit: string;
}

export default function LpoCreateScreen() {
  const { logout, picker } = useAuthStore();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [search, setSearch] = useState('');
  
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [showItemModal, setShowItemModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [lpoPayload, setLpoPayload] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const qrRef = useRef<any>(null);

  const generateAutoLpoNumber = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `LPO-${yyyy}${mm}${dd}-${rnd}`;
  };

  useEffect(() => {
    fetchCatalogue();
    setOrderNumber(generateAutoLpoNumber());
  }, []);

  const fetchCatalogue = async () => {
    try {
      const res = await api.get('/catalogue');
      setCatalogue(res.data || []);
    } catch (err) {
      // Handle error quietly
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const addToCart = (item: CatalogueItem) => {
    if (item.available_quantity <= 0) {
      Alert.alert('Out of Stock', 'This item is out of stock and cannot be added.');
      return;
    }
    const existing = cart.find(c => c.barcode === item.barcode);
    if (existing) {
      if (existing.quantity >= item.available_quantity) {
        Alert.alert('Stock Limit Reached', 'Cannot add more than available quantity.');
      } else {
        setCart(cart.map(c => c.barcode === item.barcode ? { ...c, quantity: c.quantity + 1 } : c));
      }
    } else {
      setCart([...cart, { barcode: item.barcode, product_name: item.item_name, quantity: 1, available_quantity: item.available_quantity, unit: 'PCS' }]);
    }
    setShowItemModal(false);
    setSearch('');
  };

  const updateQuantity = (barcode: string, qtyStr: string) => {
    let qty = parseInt(qtyStr) || 0;
    const item = cart.find(c => c.barcode === barcode);
    if (item) {
      if (qty > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
        qty = item.available_quantity;
      }
      if (qty < 1) qty = 1;
      setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: qty } : c));
    }
  };

  const incrementQuantity = (barcode: string) => {
    const item = cart.find(c => c.barcode === barcode);
    if (item) {
      if (item.quantity + 1 > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
      } else {
        setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: c.quantity + 1 } : c));
      }
    }
  };

  const decrementQuantity = (barcode: string) => {
    const item = cart.find(c => c.barcode === barcode);
    if (item && item.quantity > 1) {
      setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: c.quantity - 1 } : c));
    }
  };

  const removeItem = (barcode: string) => {
    setCart(cart.filter(c => c.barcode !== barcode));
  };

  const generateLPO = () => {
    if (!customerName.trim() || !orderNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a customer name and LPO number.');
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one item to the LPO.');
      return;
    }
    
    const payloadObj = {
      type: "LPO",
      order: orderNumber.trim(),
      customer: customerName.trim(),
      items: cart.map(c => ({ b: c.barcode, q: c.quantity, u: c.unit }))
    };
    
    setLpoPayload(JSON.stringify(payloadObj));
    setShowQRModal(true);
  };

  const handleDone = () => {
    setShowQRModal(false);
    setCart([]);
    setCustomerName('');
    setOrderNumber(generateAutoLpoNumber());
  };

  const handleShare = async () => {
    if (!qrRef.current) return;
    
    try {
      setIsGenerating(true);
      
      qrRef.current.toDataURL(async (dataURL: string) => {
        const qrImageSrc = `data:image/png;base64,${dataURL}`;
        
        const d = new Date();
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        
        let tableRows = cart.map((item, index) => `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${index + 1}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-family: monospace;">${item.barcode}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.product_name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity} ${item.unit}</td>
          </tr>
        `).join('');

        const htmlContent = `
          <html>
            <head>
              <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #003527; padding-bottom: 20px; margin-bottom: 30px; }
                .logo-area { display: flex; align-items: center; }
                .logo-box { width: 60px; height: 60px; background-color: #003527; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; margin-right: 15px; border-radius: 8px; }
                .brand-title { color: #003527; margin: 0; font-size: 28px; text-transform: uppercase; letter-spacing: 2px; }
                .brand-sub { color: #666; margin: 5px 0 0 0; font-size: 14px; }
                .qr-area { text-align: right; }
                .qr-img { width: 120px; height: 120px; border: 1px solid #eee; padding: 5px; border-radius: 8px; }
                .doc-title { text-align: center; font-size: 24px; margin: 20px 0; text-transform: uppercase; letter-spacing: 4px; color: #333; }
                .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; }
                .info-block h4 { margin: 0 0 5px 0; color: #666; font-size: 12px; text-transform: uppercase; }
                .info-block p { margin: 0; font-size: 16px; font-weight: bold; color: #111; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th { background-color: #003527; color: white; padding: 12px 10px; text-align: left; font-size: 14px; text-transform: uppercase; }
                th.center { text-align: center; }
                .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
              </style>
            </head>
            <body>
              <div class="header">
                <div class="logo-area">
                  <div class="logo-box">NG</div>
                  <div>
                    <h1 class="brand-title">Noor Ghazal</h1>
                    <p class="brand-sub">General Trading LLC</p>
                  </div>
                </div>
                <div class="qr-area">
                  <img src="${qrImageSrc}" class="qr-img" />
                  <div style="font-size: 10px; color: #666; margin-top: 5px;">Scan to Import Order</div>
                </div>
              </div>
              
              <div class="doc-title">Local Purchase Order</div>
              
              <div class="info-section">
                <div class="info-block">
                  <h4>Customer Name</h4>
                  <p>${customerName}</p>
                </div>
                <div class="info-block" style="text-align: right;">
                  <h4>LPO Reference</h4>
                  <p>${orderNumber}</p>
                  <h4 style="margin-top: 10px;">Date</h4>
                  <p>${dateStr}</p>
                </div>
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th class="center" style="width: 50px;">#</th>
                    <th style="width: 150px;">SKU / Barcode</th>
                    <th>Description</th>
                    <th class="center" style="width: 100px;">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
              
              <div class="footer">
                <p>This is a system-generated document. For internal processing via NexWare WMS.</p>
                <p>Generated by: ${picker?.full_name || 'Authorized Personnel'}</p>
              </div>
            </body>
          </html>
        `;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            dialogTitle: `Share LPO ${orderNumber}`,
            mimeType: 'application/pdf',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      });
      
    } catch (err) {
      Alert.alert('Error', 'Failed to generate or share the LPO document.');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredCatalogue = catalogue.filter(c => 
    c.item_name.toLowerCase().includes(search.toLowerCase()) || 
    c.barcode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row justify-between items-center shadow-sm z-10">
        <View>
          <Text className="text-xl font-black text-onSurface font-inter">LPO Generator</Text>
          <Text className="text-xs text-primary font-bold font-inter mt-0.5">Welcome, {picker?.full_name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
          <LogOut size={18} color="#e11d48" />
        </TouchableOpacity>
      </View>

      {/* Main Form */}
      <View className="flex-1 p-4">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-inter uppercase tracking-wider">Customer Name</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 font-inter text-base text-gray-800 font-semibold"
            placeholder="e.g. Acme Corp"
            value={customerName}
            onChangeText={setCustomerName}
          />
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-inter uppercase tracking-wider">LPO Number (Auto-Generated)</Text>
          <TextInput
            className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 font-inter text-base text-gray-800 font-semibold"
            placeholder="LPO-XXXXX"
            value={orderNumber}
            onChangeText={setOrderNumber}
            editable={false}
          />
        </View>

        <View className="flex-row justify-between items-center mb-3 px-1">
          <Text className="text-sm font-black text-gray-800 font-inter uppercase tracking-wide">Line Items ({cart.length})</Text>
        </View>

        <FlatList
          data={cart}
          keyExtractor={(item) => item.barcode}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-3 flex-col">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-gray-800 text-sm mb-1">{item.product_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold bg-gray-100 self-start px-2 py-0.5 rounded-md">{item.barcode}</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(item.barcode)} className="p-2 bg-rose-50 rounded-lg">
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              
              <View className="flex-row items-center justify-between border-t border-gray-100 pt-3">
                <Text className="text-xs font-bold text-emerald-600">Stock: {item.available_quantity}</Text>
                <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <TouchableOpacity onPress={() => decrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">-</Text>
                  </TouchableOpacity>
                  <TextInput
                    className="w-12 text-center font-black text-sm bg-white h-full border-x border-gray-200"
                    keyboardType="number-pad"
                    value={String(item.quantity)}
                    onChangeText={(val) => updateQuantity(item.barcode, val)}
                  />
                  <TouchableOpacity onPress={() => incrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
              <Text className="text-gray-400 font-inter text-sm font-semibold">No items added to LPO yet.</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity 
              onPress={() => setShowItemModal(true)} 
              className="mt-2 bg-emerald-50 py-4 rounded-2xl flex-row items-center justify-center border border-emerald-200 border-dashed"
            >
              <Plus size={18} color="#059669" />
              <Text className="text-emerald-700 text-sm font-black ml-2 uppercase tracking-wider">Add Line Item</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Generate Button */}
      <View className="p-4 bg-white border-t border-gray-200">
        <TouchableOpacity
          className="bg-[#003527] py-4 rounded-2xl flex-row items-center justify-center shadow-md"
          onPress={generateLPO}
        >
          <QrCode size={20} color="white" />
          <Text className="text-white font-black ml-2 text-base font-inter uppercase tracking-widest">Generate LPO</Text>
        </TouchableOpacity>
      </View>

      {/* Item Selection Modal */}
      <Modal visible={showItemModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
            <Text className="text-lg font-black text-gray-800">Select Product</Text>
            <TouchableOpacity onPress={() => setShowItemModal(false)} className="px-2 py-1">
              <Text className="text-primary font-bold text-base">Done</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-100 bg-gray-50">
            <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4">
              <Search size={18} color="#9ca3af" />
              <TextInput
                className="flex-1 py-3 px-2 font-inter text-base font-semibold text-gray-800"
                placeholder="Search by name or barcode..."
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={filteredCatalogue}
            keyExtractor={item => item.barcode}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
                onPress={() => addToCart(item)}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-gray-800 text-base mb-1">{item.item_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold">{item.barcode}</Text>
                </View>
                <View className={`px-3 py-1.5 rounded-lg border ${item.available_quantity > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <Text className={`text-xs font-black ${item.available_quantity > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {item.available_quantity > 0 ? `${item.available_quantity} PCS` : 'Out of Stock'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* QR Code & Share Modal */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center px-4">
          <View className="bg-white rounded-3xl overflow-hidden w-full max-w-sm">
            <View className="bg-white p-6 items-center">
              <View className="w-16 h-16 rounded-full bg-emerald-100 mb-4 items-center justify-center border-4 border-white shadow-sm">
                <CheckCircle2 size={32} color="#059669" />
              </View>
              <Text className="text-xl font-black text-gray-800 text-center uppercase tracking-wider">
                LPO Generated
              </Text>
              <Text className="text-sm font-bold text-primary text-center mb-6 mt-1">{orderNumber}</Text>

              <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 mb-6">
                {lpoPayload ? (
                  <QRCode
                    value={lpoPayload}
                    size={220}
                    color="#003527"
                    backgroundColor="white"
                    getRef={(c) => (qrRef.current = c)}
                  />
                ) : null}
              </View>

              <View className="w-full bg-gray-50 rounded-xl p-4 border border-gray-100">
                <View className="flex-row justify-between mb-3">
                  <Text className="text-xs text-gray-500 font-bold uppercase tracking-wider">Customer</Text>
                  <Text className="text-xs text-gray-800 font-black">{customerName}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Lines</Text>
                  <Text className="text-xs text-gray-800 font-black">{cart.length} items</Text>
                </View>
              </View>
              
              <Text className="text-[10px] text-gray-400 text-center mt-6 font-semibold uppercase tracking-widest">
                Internal Document — WMS Scanner Ready
              </Text>
            </View>

            <View className="p-4 bg-gray-50 border-t border-gray-200 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-white border border-gray-300 py-3.5 rounded-xl items-center shadow-sm"
                onPress={handleDone}
              >
                <Text className="text-gray-700 font-black tracking-wide">Done (Clear)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-primary py-3.5 rounded-xl flex-row items-center justify-center shadow-sm"
                onPress={handleShare}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Share size={18} color="white" />
                    <Text className="text-white font-black ml-2 tracking-wide">Export PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
