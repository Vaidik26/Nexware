import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Plus, Trash2, QrCode, Share, CheckCircle2 } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
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
  
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    fetchCatalogue();
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
    const existing = cart.find(c => c.barcode === item.barcode);
    if (existing) {
      setCart(cart.map(c => c.barcode === item.barcode ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { barcode: item.barcode, product_name: item.item_name, quantity: 1, unit: 'PCS' }]);
    }
    setShowItemModal(false);
    setSearch('');
  };

  const updateQuantity = (barcode: string, qtyStr: string) => {
    const qty = parseInt(qtyStr) || 0;
    setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: qty } : c));
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
    
    // Create the JSON payload. Ensure it's compact so the QR code isn't too dense.
    const payloadObj = {
      type: "LPO",
      order: orderNumber.trim(),
      customer: customerName.trim(),
      items: cart.map(c => ({ b: c.barcode, q: c.quantity, u: c.unit }))
    };
    
    setLpoPayload(JSON.stringify(payloadObj));
    setShowQRModal(true);
  };

  const handleShare = async () => {
    if (viewShotRef.current && viewShotRef.current.capture) {
      try {
        setIsGenerating(true);
        const uri = await viewShotRef.current.capture();
        
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            dialogTitle: `Share LPO ${orderNumber}`,
            mimeType: 'image/jpeg',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to generate or share the LPO image.');
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const filteredCatalogue = catalogue.filter(c => 
    c.item_name.toLowerCase().includes(search.toLowerCase()) || 
    c.barcode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row justify-between items-center">
        <View>
          <Text className="text-xl font-bold text-onSurface font-inter">LPO Generator</Text>
          <Text className="text-xs text-primary font-inter">Welcome, {picker?.full_name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} className="bg-rose-50 p-2 rounded-xl border border-rose-100">
          <LogOut size={18} color="#e11d48" />
        </TouchableOpacity>
      </View>

      {/* Main Form */}
      <View className="flex-1 p-4">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
          <Text className="text-xs font-bold text-gray-500 mb-1 font-inter uppercase">Customer Details</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 font-inter text-base"
            placeholder="Customer Name (e.g. Acme Corp)"
            value={customerName}
            onChangeText={setCustomerName}
          />
          <Text className="text-xs font-bold text-gray-500 mb-1 font-inter uppercase">LPO Number</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-inter text-base"
            placeholder="LPO-XXXXX"
            value={orderNumber}
            onChangeText={setOrderNumber}
          />
        </View>

        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-sm font-bold text-gray-700 font-inter uppercase">Line Items ({cart.length})</Text>
          <TouchableOpacity onPress={() => setShowItemModal(true)} className="bg-emerald-100 px-3 py-1.5 rounded-lg flex-row items-center border border-emerald-200">
            <Plus size={16} color="#059669" />
            <Text className="text-emerald-700 text-xs font-bold ml-1 font-inter">Add Item</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={cart}
          keyExtractor={(item) => item.barcode}
          className="flex-1"
          renderItem={({ item }) => (
            <View className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm mb-2 flex-row items-center">
              <View className="flex-1">
                <Text className="font-bold text-onSurface text-sm">{item.product_name}</Text>
                <Text className="text-xs text-gray-500 font-mono mt-0.5">{item.barcode}</Text>
              </View>
              <View className="flex-row items-center">
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 w-12 text-center font-bold mr-2"
                  keyboardType="number-pad"
                  value={String(item.quantity)}
                  onChangeText={(val) => updateQuantity(item.barcode, val)}
                />
                <Text className="text-xs text-gray-500 font-bold mr-3">{item.unit}</Text>
                <TouchableOpacity onPress={() => removeItem(item.barcode)} className="p-2">
                  <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
              <Text className="text-gray-400 font-inter text-sm">No items added to LPO yet.</Text>
            </View>
          }
        />
      </View>

      {/* Generate Button */}
      <View className="p-4 bg-white border-t border-gray-200">
        <TouchableOpacity
          className="bg-[#003527] py-4 rounded-xl flex-row items-center justify-center"
          onPress={generateLPO}
        >
          <QrCode size={20} color="white" />
          <Text className="text-white font-bold ml-2 text-base font-inter">Generate LPO payload</Text>
        </TouchableOpacity>
      </View>

      {/* Item Selection Modal */}
      <Modal visible={showItemModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
            <Text className="text-lg font-bold text-onSurface">Select Product</Text>
            <TouchableOpacity onPress={() => setShowItemModal(false)}>
              <Text className="text-primary font-bold">Close</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-100">
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-inter text-base"
              placeholder="Search catalogue..."
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <FlatList
            data={filteredCatalogue}
            keyExtractor={item => item.barcode}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="px-4 py-3 border-b border-gray-100 flex-row justify-between items-center"
                onPress={() => addToCart(item)}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-gray-800">{item.item_name}</Text>
                  <Text className="text-xs text-gray-500 font-mono mt-0.5">{item.barcode}</Text>
                </View>
                <View className="bg-gray-100 px-2 py-1 rounded-lg">
                  <Text className="text-xs font-bold text-gray-600">Stock: {item.available_quantity}</Text>
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
            <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.9 }}>
              <View className="bg-white p-6 items-center">
                <View className="w-12 h-12 rounded-full bg-emerald-50 mb-3 items-center justify-center">
                  <CheckCircle2 size={24} color="#10b981" />
                </View>
                <Text className="text-xl font-black text-onSurface text-center uppercase tracking-wide">
                  Purchase Order
                </Text>
                <Text className="text-sm font-bold text-primary text-center mb-6">{orderNumber}</Text>

                <View className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 mb-6">
                  {lpoPayload ? (
                    <QRCode
                      value={lpoPayload}
                      size={200}
                      color="#0b1c30"
                      backgroundColor="white"
                    />
                  ) : null}
                </View>

                <View className="w-full bg-gray-50 rounded-xl p-4">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-xs text-gray-500 font-bold">Customer</Text>
                    <Text className="text-xs text-gray-800 font-bold">{customerName}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-bold">Total Lines</Text>
                    <Text className="text-xs text-gray-800 font-bold">{cart.length} items</Text>
                  </View>
                </View>
                
                <Text className="text-[10px] text-gray-400 text-center mt-6">
                  Scan this code in the NexWare Admin Panel to instantly generate a picklist.
                </Text>
              </View>
            </ViewShot>

            <View className="p-4 bg-gray-50 border-t border-gray-200 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-white border border-gray-300 py-3 rounded-xl items-center"
                onPress={() => setShowQRModal(false)}
              >
                <Text className="text-gray-600 font-bold">Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-primary py-3 rounded-xl flex-row items-center justify-center"
                onPress={handleShare}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <>
                    <Share size={16} color="white" />
                    <Text className="text-white font-bold ml-2">Share LPO</Text>
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
