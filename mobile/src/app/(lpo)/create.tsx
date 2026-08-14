import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Plus, Trash2, QrCode, Share, Search } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';

interface CatalogueItem {
  id: number;
  primary_barcode: string;
  item_name: string;
  available_quantity: number;
}

interface CartItem {
  id: number;
  barcode: string;
  product_name: string;
  quantity: number;
  available_quantity: number;
  unit: string;
}

const generateAutoLpoNumber = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `LPO-${yyyy}${mm}${dd}-${rnd}`;
};

export default function LpoCreateScreen() {
  const { logout, picker } = useAuthStore();
  const router = useRouter();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState(generateAutoLpoNumber());
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [search, setSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  
  // SUCCESS MODAL STATE
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [selectedLpoFile, setSelectedLpoFile] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const fetchCatalogue = async () => {
    try {
      const res = await api.get('/catalogue');
      setCatalogue(res.data || []);
    } catch (err) {
      // Handle error quietly
    }
  };

  const fetchCustomers = async (searchQuery: string = '') => {
    try {
      const endpoint = searchQuery ? `/customers?q=${encodeURIComponent(searchQuery)}` : '/customers';
      const custRes = await api.get(endpoint);
      setCustomers(custRes.data || []);
    } catch (err) {
      console.log('Error fetching customers:', err);
    }
  };

  useEffect(() => {
    fetchCatalogue();
  }, []);

  useEffect(() => {
    fetchCustomers(debouncedSearch);
  }, [debouncedSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCatalogue(), fetchCustomers(debouncedSearch)]);
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  const addToCart = (item: CatalogueItem) => {
    if (item.available_quantity <= 0) {
      Alert.alert('Out of Stock', 'This item is out of stock and cannot be added.');
      return;
    }
    const existing = cart.find(c => 
      (c.id && item.id && c.id === item.id) || 
      (c.barcode && item.primary_barcode && c.barcode === item.primary_barcode)
    );
    if (existing) {
      Alert.alert('Already Added', 'This item is already in the LPO. You can adjust its quantity from the list.');
      return;
    } else {
      setCart([...cart, { id: item.id, barcode: item.primary_barcode || '', product_name: item.item_name, quantity: 1, available_quantity: item.available_quantity, unit: 'PCS' }]);
    }
    setShowItemModal(false);
    setSearch('');
  };

  const updateQuantity = (id: number, qtyStr: string) => {
    let qty = parseInt(qtyStr) || 0;
    const item = cart.find(c => c.id === id);
    if (item) {
      if (qty > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
        qty = item.available_quantity;
      }
      if (qty < 1) qty = 1;
      setCart(cart.map(c => c.id === id ? { ...c, quantity: qty } : c));
    }
  };

  const incrementQuantity = (id: number) => {
    const item = cart.find(c => c.id === id);
    if (item) {
      if (item.quantity + 1 > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
      } else {
        setCart(cart.map(c => c.id === id ? { ...c, quantity: c.quantity + 1 } : c));
      }
    }
  };

  const decrementQuantity = (id: number) => {
    const item = cart.find(c => c.id === id);
    if (item && item.quantity > 1) {
      setCart(cart.map(c => c.id === id ? { ...c, quantity: c.quantity - 1 } : c));
    }
  };

  const removeItem = (id: number) => {
    setCart(cart.filter(c => c.id !== id));
  };

  const reviewOrder = () => {
    if (!customerName.trim() || !orderNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a customer name and LPO number.');
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one item to the LPO.');
      return;
    }
    
    setSuccessModalVisible(true);
    setIsConfirmed(false);
    setSelectedLpoFile(null);
  };

  const handleConfirmOrder = async () => {
    try {
      setIsGenerating(true);
      const payload: any = {
        lpo_number: orderNumber.trim(),
        customer_name: customerName.trim(),
        source: 'mobile',
        items: cart.map(c => ({
          barcode: c.barcode,
          quantity: c.quantity,
          unit: c.unit,
          product_name: c.product_name
        }))
      };
      if (deliveryDate) {
        payload.delivery_date = deliveryDate.toISOString();
      }

      const res = await api.post('/lpos', payload);
      const createdLpo = res.data;
      
      if (selectedLpoFile) {
        const formData = new FormData();
        formData.append('file', {
          uri: selectedLpoFile.uri,
          name: selectedLpoFile.filename,
          type: selectedLpoFile.mimeType,
        } as any);

        await api.post(`/lpos/${createdLpo.id}/upload-pdf`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      setIsConfirmed(true);
      
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to confirm LPO.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessModalVisible(false);
    if (isConfirmed) {
      setCart([]);
      setCustomerName('');
      setDeliveryDate(undefined);
      setOrderNumber(generateAutoLpoNumber());
      setSelectedLpoFile(null);
      setIsConfirmed(false);
    }
  };

  const resetFormExplicitly = () => {
    setSuccessModalVisible(false);
    setCart([]);
    setCustomerName('');
    setDeliveryDate(undefined);
    setOrderNumber(generateAutoLpoNumber());
    setSelectedLpoFile(null);
    setIsConfirmed(false);
  };




  const handleUploadLpoPdf = async () => {
    Alert.alert(
      'Attach Signed LPO',
      'Choose how to attach the signed LPO:',
      [
        {
          text: '📷 Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera permission is required.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            });
            if (!result.canceled && result.assets[0]) {
              setSelectedLpoFile({
                uri: result.assets[0].uri,
                mimeType: result.assets[0].mimeType || 'image/jpeg',
                filename: `lpo-${orderNumber}.jpg`
              });
            }
          },
        },
        {
          text: '📎 Attach File',
          onPress: async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['application/pdf', 'image/*'],
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets[0]) {
              setSelectedLpoFile({
                uri: result.assets[0].uri,
                mimeType: result.assets[0].mimeType || 'application/pdf',
                filename: result.assets[0].name
              });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

    const handleDownloadPDF = async (share: boolean = false) => {
    try {
      const d = new Date();
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

      const itemRows = cart.map((item, idx) => (
        `<tr><td class="num">${idx + 1}</td><td class="desc">${item.product_name}</td><td class="bc">${item.barcode}</td><td class="uom">${item.unit}</td><td class="qty">${item.quantity}</td></tr>`
      )).join('');

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        @page { size: 80mm auto; margin: 4mm 3mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 10px; width: 74mm; color: #000; background: #fff; }
        .center { text-align: center; }
        .header-company { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 2px; }
        .header-sub { font-size: 9px; text-align: center; margin-bottom: 4px; }
        .divider { border-top: 1px dashed #000; margin: 3px 0; }
        .thick-div { border-top: 2px solid #000; margin: 4px 0; }
        .field-row { display: flex; justify-content: space-between; margin: 1.5px 0; font-size: 10px; }
        .field-label { font-weight: bold; min-width: 65px; }
        .section-title { font-weight: bold; font-size: 11px; text-align: center; margin: 3px 0; text-transform: uppercase; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; margin: 3px 0; font-size: 9px; }
        th { font-weight: bold; border-bottom: 1px solid #000; padding: 2px 1px; text-align: left; }
        td { padding: 2px 1px; border-bottom: 1px dotted #ccc; vertical-align: top; }
        .num { width: 8%; text-align: center; }
        .desc { width: 42%; word-break: break-word; }
        .bc { width: 26%; font-size: 8px; color: #333; }
        .uom { width: 10%; text-align: center; }
        .qty { width: 14%; text-align: right; font-weight: bold; }
        .total-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; margin: 1px 0; }
        .footer { font-size: 8px; text-align: center; margin-top: 6px; color: #444; }
        .status-box { border: 1px solid #000; padding: 3px 6px; margin: 4px 0; font-size: 9px; text-align: center; }
      </style></head><body>
        <div class="header-company">NOOR GHAZAL GENERAL TRADING LLC</div>
        <div class="header-sub">Dubai, UAE | Internal Warehouse Document</div>
        <div class="thick-div"></div>
        <div class="section-title">Local Purchase Order</div>
        <div class="thick-div"></div>
        <div class="field-row"><span class="field-label">LPO Ref:</span><span>${orderNumber}</span></div>
        <div class="field-row"><span class="field-label">Date:</span><span>${dateStr} ${timeStr}</span></div>
        <div class="field-row"><span class="field-label">Customer:</span><span>${customerName}</span></div>
        <div class="field-row"><span class="field-label">Sales Rep:</span><span>${picker?.full_name || 'System User'}</span></div>
        ${deliveryDate ? `<div class="field-row"><span class="field-label">Delivery:</span><span>${deliveryDate.toISOString().split('T')[0]}</span></div>` : ''}
        <div class="field-row"><span class="field-label">Status:</span><span>PENDING</span></div>
        <div class="thick-div"></div>
        <div class="section-title">Line Items (${cart.length})</div>
        <div class="divider"></div>
        <table><thead><tr>
          <th class="num">#</th><th class="desc">Description</th><th class="bc">Barcode</th><th class="uom">UOM</th><th class="qty">Qty</th>
        </tr></thead><tbody>${itemRows}</tbody></table>
        <div class="thick-div"></div>
        <div class="total-row"><span>Total Lines:</span><span>${cart.length}</span></div>
        <div class="total-row"><span>Total Qty:</span><span>${totalQty}</span></div>
        <div class="thick-div"></div>
        <div class="status-box"><strong>INTERNAL USE ONLY</strong><br/>Generated via NexWare Terminal</div>
        <div class="footer">* Please verify all items before dispatch *</div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to generate LPO PDF.');
    }
  };

  const filteredCatalogue = catalogue.filter(c => 
    !cart.some(cartItem => 
      (cartItem.id && c.id && cartItem.id === c.id) || 
      (cartItem.barcode && c.primary_barcode && cartItem.barcode === c.primary_barcode)
    ) &&
    (c.item_name.toLowerCase().includes(search.toLowerCase()) || 
    (c.primary_barcode || '').toLowerCase().includes(search.toLowerCase()))
  );

  const filteredCustomers = customers.filter(c => 
    (c?.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
    (c?.customer_code || '').toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row justify-between items-center shadow-sm z-10">
        <View>
          <Text className="text-xl font-black text-onSurface font-sans">Create Order</Text>
          <Text className="text-xs text-primary font-bold font-sans mt-0.5">Welcome, {picker?.full_name}</Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={() => router.push('/history')} className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
            <Text className="font-bold text-emerald-700 text-xs">History</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
            <LogOut size={18} color="#e11d48" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Form */}
      <View className="flex-1 p-4">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-sans uppercase tracking-wider">Customer Name</Text>
          <TouchableOpacity 
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 flex-row items-center justify-between"
            onPress={() => setShowCustomerModal(true)}
          >
            <Text className={`font-sans text-base font-semibold flex-1 ${customerName ? 'text-gray-800' : 'text-gray-400'}`}>
              {customerName || 'Select Customer'}
            </Text>
            <Search size={16} color="#9ca3af" />
          </TouchableOpacity>
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-sans uppercase tracking-wider">Delivery Date (Optional)</Text>
          <TouchableOpacity 
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3"
            onPress={() => setShowDatePicker(true)}
          >
            <Text className={`font-sans text-base font-semibold ${deliveryDate ? 'text-gray-800' : 'text-gray-400'}`}>
              {deliveryDate ? deliveryDate.toISOString().split('T')[0] : 'Select Date'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={deliveryDate || new Date()}
              mode="date"
              display="default"
              onChange={(event: any, selectedDate?: Date) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setDeliveryDate(selectedDate);
                }
              }}
            />
          )}
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-sans uppercase tracking-wider">LPO Number (Auto-Generated)</Text>
          <TextInput
            className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 font-sans text-base text-gray-800 font-semibold"
            placeholder="LPO-XXXXX"
            value={orderNumber}
            onChangeText={setOrderNumber}
            editable={false}
          />
        </View>

        <View className="flex-row justify-between items-center mb-3 px-1">
          <Text className="text-sm font-black text-gray-800 font-sans uppercase tracking-wide">Line Items ({cart.length})</Text>
        </View>

        <FlatList
          data={cart}
          keyExtractor={(item, index) => item.id ? item.id.toString() : (item.barcode || `temp-${index}`)}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#003527"]} tintColor="#006c49" />}
          renderItem={({ item }) => (
            <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-3 flex-col">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-gray-800 text-sm mb-1">{item.product_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold bg-gray-100 self-start px-2 py-0.5 rounded-md">{item.barcode}</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(item.id)} className="p-2 bg-rose-50 rounded-lg">
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              
              <View className="flex-row items-center justify-between border-t border-gray-100 pt-3">
                <Text className="text-xs font-bold text-emerald-600">Stock: {item.available_quantity}</Text>
                <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <TouchableOpacity onPress={() => decrementQuantity(item.id)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">-</Text>
                  </TouchableOpacity>
                  <TextInput
                    className="w-12 text-center font-black text-sm bg-white h-full border-x border-gray-200"
                    keyboardType="number-pad"
                    value={String(item.quantity)}
                    onChangeText={(val) => updateQuantity(item.id, val)}
                  />
                  <TouchableOpacity onPress={() => incrementQuantity(item.id)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
              <Text className="text-gray-400 font-sans text-sm font-semibold">No items added to LPO yet.</Text>
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
          onPress={reviewOrder}
        >
          <Text className="text-white font-black text-base font-sans uppercase tracking-widest">Review Order</Text>
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
                className="flex-1 py-3 px-2 font-sans text-base font-semibold text-gray-800"
                placeholder="Search by name or barcode..."
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={filteredCatalogue}
            keyExtractor={(item, index) => item.id ? item.id.toString() : (item.primary_barcode || `cat-${index}`)}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
                onPress={() => addToCart(item)}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-gray-800 text-base mb-1">{item.item_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold">{item.primary_barcode}</Text>
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

      {/* Customer Selection Modal */}
      <Modal visible={showCustomerModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
            <Text className="text-lg font-black text-gray-800">Select Customer</Text>
            <TouchableOpacity onPress={() => setShowCustomerModal(false)} className="px-2 py-1">
              <Text className="text-primary font-bold text-base">Close</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-100 bg-gray-50">
            <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4">
              <Search size={18} color="#9ca3af" />
              <TextInput
                className="flex-1 py-3 px-2 font-sans text-base font-semibold text-gray-800"
                placeholder="Search by name or code..."
                value={customerSearch}
                onChangeText={setCustomerSearch}
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={filteredCustomers}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
                onPress={() => {
                  setCustomerName(item.name);
                  setShowCustomerModal(false);
                  setCustomerSearch('');
                }}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-gray-800 text-base mb-1">{item.name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold">{item.customer_code}</Text>
                </View>
                <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center border border-emerald-200">
                  <Plus size={16} color="#059669" />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="p-8 items-center justify-center">
                <Text className="text-gray-400 font-sans text-sm font-semibold text-center">No customers found.</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-6">
              {isConfirmed ? (
                <>
                  <View className="w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-4">
                    <Text className="text-emerald-600 text-2xl">✓</Text>
                  </View>
                  <Text className="text-2xl font-black text-slate-800 text-center">Confirmed!</Text>
                  <Text className="text-slate-500 text-center mt-2">LPO <Text className="font-bold text-slate-700">{orderNumber}</Text> has been submitted for WM Review.</Text>
                </>
              ) : (
                <>
                  <View className="w-16 h-16 bg-blue-100 rounded-full items-center justify-center mb-4">
                    <Search size={32} color="#2563eb" />
                  </View>
                  <Text className="text-2xl font-black text-slate-800 text-center">Review Order</Text>
                  <Text className="text-slate-500 text-center mt-2">Order <Text className="font-bold text-slate-700">{orderNumber}</Text> is ready for review.</Text>
                </>
              )}
            </View>

            <View className="gap-3">
              <TouchableOpacity 
                onPress={() => handleDownloadPDF(true)} 
                className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2"
              >
                <Text className="font-bold text-slate-700 text-base">⬇ Download LPO</Text>
              </TouchableOpacity>

              {!isConfirmed && (
                <>
                  <TouchableOpacity 
                    onPress={handleUploadLpoPdf} 
                    className="w-full p-4 rounded-xl bg-blue-50 border border-blue-200 items-center justify-center flex-row gap-2"
                  >
                    <Text className="font-bold text-blue-700 text-base">
                      {selectedLpoFile ? `📎 ${selectedLpoFile.filename}` : '⬆ Attach Signed LPO (Optional)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={handleConfirmOrder} 
                    disabled={isGenerating} 
                    className="w-full p-4 rounded-xl bg-[#003527] items-center justify-center flex-row gap-2"
                  >
                    {isGenerating ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="font-bold text-white text-base">✅ Confirm Order</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {isConfirmed ? (
                <TouchableOpacity 
                  onPress={resetFormExplicitly}
                  className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2 mt-2"
                >
                  <Text className="font-bold text-slate-700 text-base">➕ Create New Order</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  onPress={handleCloseSuccess}
                  className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2 mt-2"
                >
                  <Text className="font-bold text-slate-500 text-base">Cancel & Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
