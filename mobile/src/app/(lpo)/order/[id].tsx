import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Modal, TextInput, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, FileText, Download, UploadCloud, Edit2, Search, Plus, Trash2 } from 'lucide-react-native';
import api from '../../../lib/api';
import { getCatalogue } from '../../../lib/catalogueCache';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import MultiPhotoModal from '../../../components/MultiPhotoModal';

const CartItemRow = React.memo(({ item, index, isEditing, removeItem, decrementQuantity, updateQuantity, validateQuantityOnBlur, incrementQuantity }: any) => {
 return (
  <View className={`p-4 flex-col bg-white border-b border-gray-100`}>
   <View className="flex-row items-start justify-between mb-2">
    <View className="flex-row items-start gap-4 flex-1 pr-2">
     <View className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 items-center justify-center">
      <Text className="text-emerald-700 font-black text-xs">{index + 1}</Text>
     </View>
     <View className="flex-1">
      <Text className="text-gray-800 font-bold text-base" numberOfLines={2}>{item.product_name}</Text>
      <Text className="text-emerald-600 font-mono text-xs font-bold mt-0.5">{item.barcode}</Text>
     </View>
    </View>
    {isEditing && (
     <TouchableOpacity onPress={() => removeItem(item.barcode)} className="p-2 bg-rose-50 rounded-lg">
      <Trash2 size={16} color="#ef4444" />
     </TouchableOpacity>
    )}
   </View>
   
   {isEditing ? (
    <View className="flex-row justify-end items-center mt-2 border-t border-gray-50 pt-2">
     <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <TouchableOpacity onPress={() => decrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
       <Text className="font-black text-gray-600 text-lg leading-5">-</Text>
      </TouchableOpacity>
      <TextInput
       className="w-12 text-center font-black text-sm bg-white h-full border-x border-gray-200"
       keyboardType="number-pad"
       value={String(item.quantity)}
       onChangeText={(val) => updateQuantity(item.barcode, val)}
       onBlur={() => validateQuantityOnBlur(item.barcode)}
       selectTextOnFocus
      />
      <TouchableOpacity onPress={() => incrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
       <Text className="font-black text-gray-600 text-lg leading-5">+</Text>
      </TouchableOpacity>
     </View>
    </View>
   ) : (
    <View className="flex-row justify-end items-center mt-1">
     <View className="items-end pl-2">
      <Text className="text-gray-500 font-semibold text-xs mb-0.5">QTY</Text>
      <Text className="text-gray-900 font-black text-lg">{item.quantity}</Text>
     </View>
    </View>
   )}
  </View>
 );
});

export default function LpoOrderDetailsScreen() {
 const { id } = useLocalSearchParams();
 const router = useRouter();
 const [lpo, setLpo] = useState<any>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [isUploading, setIsUploading] = useState(false);
 const [isSharing, setIsSharing] = useState(false);
 
 // Edit mode state
 const [isEditing, setIsEditing] = useState(false);
 const [cart, setCart] = useState<any[]>([]);
 const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
 const [showDatePicker, setShowDatePicker] = useState(false);
 const [isSaving, setIsSaving] = useState(false);
 
 // Catalogue modal state
 const [catalogue, setCatalogue] = useState<any[]>([]);
 const [showItemModal, setShowItemModal] = useState(false);
 const [search, setSearch] = useState('');
 
 const [quantityModalVisible, setQuantityModalVisible] = useState(false);
 const [selectedItemForQuantity, setSelectedItemForQuantity] = useState<any>(null);
 const [tempQuantity, setTempQuantity] = useState('1');
 const quantityInputRef = useRef<any>(null);
 const [showCameraModal, setShowCameraModal] = useState(false);

 useEffect(() => {
  if (id) {
   fetchLpoDetails();
   fetchCatalogue();
  }
 }, [id]);

 const fetchLpoDetails = async () => {
  try {
   setIsLoading(true);
   const res = await api.get(`/lpos/${id}`);
   setLpo(res.data);
  } catch (err) {
   console.error(err);
   Alert.alert('Error', 'Failed to load order details.');
   router.back();
  } finally {
   setIsLoading(false);
  }
 };

 const fetchCatalogue = async () => {
  try {
   // Shared cache with the create screen: opening an order to edit no longer
   // re-downloads the whole product list.
   const items = await getCatalogue(setCatalogue);
   setCatalogue(items);
  } catch (err) {
   console.error(err);
  }
 };

 const toggleEditMode = () => {
  if (isEditing) {
   setIsEditing(false); // Discard
  } else {
   setCart(lpo.items ? JSON.parse(JSON.stringify(lpo.items)) : []);
   setDeliveryDate(lpo.delivery_date ? new Date(lpo.delivery_date) : undefined);
   setIsEditing(true);
  }
 };

 const saveChanges = async () => {
  if (cart.length === 0) {
   Alert.alert('Validation Error', 'Order must have at least one item.');
   return;
  }
  try {
   setIsSaving(true);
   const payload: any = {
    items: cart.map(c => ({
     barcode: c.barcode,
     quantity: parseInt(c.quantity) || 1,
     unit: c.unit,
     product_name: c.product_name
    }))
   };
   if (deliveryDate) {
    payload.delivery_date = deliveryDate.toISOString();
   }
   
   const res = await api.put(`/lpos/${id}`, payload);
   setLpo(res.data);
   setIsEditing(false);
   Alert.alert('Success', 'Order updated successfully.');
  } catch (err: any) {
   console.error(err);
   Alert.alert('Error', err.response?.data?.detail || 'Failed to update order.');
  } finally {
   setIsSaving(false);
  }
 };

 const handleSelectFromCatalogue = (item: any) => {
  const existing = cart.find(c => 
   (c.id && item.id && c.id === item.id) || 
   (c.barcode && item.primary_barcode && c.barcode === item.primary_barcode)
  );
  if (existing) {
   Alert.alert('Already Added', 'This item is already in the order.');
   return;
  }
  
  setSelectedItemForQuantity(item);
  setTempQuantity('1');
  setQuantityModalVisible(true);
 };

 const confirmQuantity = () => {
  if (!selectedItemForQuantity) return;
  let qty = parseInt(tempQuantity, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  
  const maxQty = selectedItemForQuantity.max_order_quantity;
  if (maxQty !== null && maxQty !== undefined && qty > maxQty) {
   Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
   return;
  }

  setCart([...cart, { 
   id: selectedItemForQuantity.id, 
   barcode: selectedItemForQuantity.primary_barcode || '', 
   product_name: selectedItemForQuantity.name, 
   quantity: qty, 
   max_order_quantity: selectedItemForQuantity.max_order_quantity, 
   unit: 'PCS' 
  }]);
  
  setQuantityModalVisible(false);
  setSelectedItemForQuantity(null);
  setShowItemModal(false);
  setSearch('');
 };

 const updateQuantity = useCallback((barcode: string, qtyStr: string) => {
  setCart(prev => prev.map(c => {
   if (c.barcode !== barcode) return c;
   const cleanStr = qtyStr.replace(/[^0-9]/g, '').replace(/^0+/, '');
   if (cleanStr === '') return { ...c, quantity: '' as any };
   let qty = parseInt(cleanStr, 10);
   if (isNaN(qty)) return c;
   const maxQty = c.max_order_quantity;
   if (maxQty !== null && maxQty !== undefined && qty > maxQty) {
    Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
    qty = maxQty;
   }
   return { ...c, quantity: qty };
  }));
 }, []);

 const validateQuantityOnBlur = useCallback((barcode: string) => {
  setCart(prev => prev.map(c => {
   if (c.barcode !== barcode) return c;
   if (!c.quantity || c.quantity < 1) return { ...c, quantity: 1 };
   return c;
  }));
 }, []);

 const incrementQuantity = useCallback((barcode: string) => {
  setCart(prev => prev.map(c => {
   if (c.barcode !== barcode) return c;
   const maxQty = c.max_order_quantity;
   if (maxQty !== null && maxQty !== undefined && c.quantity + 1 > maxQty) {
    Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
    return c;
   }
   return { ...c, quantity: Number(c.quantity) + 1 };
  }));
 }, []);

 const decrementQuantity = useCallback((barcode: string) => {
  setCart(prev => prev.map(c => {
   if (c.barcode !== barcode) return c;
   if (c.quantity > 1) return { ...c, quantity: Number(c.quantity) - 1 };
   return c;
  }));
 }, []);

 const removeItem = useCallback((barcode: string) => {
  setCart(prev => prev.filter(c => c.barcode !== barcode));
 }, []);

 const handleOpenPdf = () => {
  if (lpo?.signed_lpo_url) {
   Linking.openURL(lpo.signed_lpo_url).catch(() => {
    Alert.alert('Error', 'Could not open the PDF document.');
   });
  }
 };

 const handleDownloadPDF = async () => {
  if (isSharing) return;
  try {
   setIsSharing(true);
   const itemsToUse = isEditing ? cart : (lpo?.items || []);
   const d = new Date();
   const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
   const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
   const totalQty = itemsToUse.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0);
   const delDate = isEditing ? deliveryDate : (lpo?.delivery_date ? new Date(lpo.delivery_date) : null);

   const itemRows = itemsToUse.map((item: any, idx: number) => (
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
    <div class="field-row"><span class="field-label">LPO Ref:</span><span>${lpo?.lpo_number}</span></div>
    <div class="field-row"><span class="field-label">Date:</span><span>${dateStr} ${timeStr}</span></div>
    <div class="field-row"><span class="field-label">Customer:</span><span>${lpo?.customer_name}</span></div>
    ${delDate ? `<div class="field-row"><span class="field-label">Delivery:</span><span>${delDate.toISOString().split('T')[0]}</span></div>` : ''}
    <div class="field-row"><span class="field-label">Status:</span><span>PENDING</span></div>
    <div class="thick-div"></div>
    <div class="section-title">Line Items (${itemsToUse.length})</div>
    <div class="divider"></div>
    <table><thead><tr>
     <th class="num">#</th><th class="desc">Description</th><th class="bc">Barcode</th><th class="uom">UOM</th><th class="qty">Qty</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <div class="thick-div"></div>
    <div class="total-row"><span>Total Lines:</span><span>${itemsToUse.length}</span></div>
    <div class="total-row"><span>Total Qty:</span><span>${totalQty}</span></div>
    <div class="thick-div"></div>
    <div class="status-box"><strong>INTERNAL USE ONLY</strong><br/>Generated via NexWare Terminal</div>
    <div class="footer">* Please verify all items before dispatch *</div>
   </body></html>`;

   // Generate PDF to file first (safer than direct print on all Android versions)
   const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });

   if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
   } else {
    await Print.printAsync({ html: htmlContent });
   }
  } catch (err: any) {
   console.error(err);
   // Silently ignore sharing-cancelled errors — these are user actions, not crashes
   const msg: string = err?.message || '';
   if (
    msg.includes('Another share request') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('dismissed')
   ) return;
   Alert.alert('Error', 'Failed to generate LPO PDF.');
  } finally {
   setIsSharing(false);
  }
 };

 const handleUploadClick = () => {
  setShowCameraModal(true);
 };

 const handleConfirmPhotos = (fileData: any) => {
  executeUpload(fileData.uri, fileData.mimeType, fileData.filename);
  setShowCameraModal(false);
 };

 const executeUpload = async (uri: string, mimeType: string, filename: string) => {
  try {
   setIsUploading(true);
   const formData = new FormData();
   formData.append('file', {
    uri,
    name: filename,
    type: mimeType,
   } as any);

   await api.post(`/lpos/${lpo.id}/upload-pdf`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
   });

   Alert.alert('✅ Success', 'LPO Photos Confirmed successfully!');
   fetchLpoDetails(); // refresh to get the url and lock the UI
  } catch (err: any) {
   Alert.alert('Confirmation Failed', err.response?.data?.detail || err.message || 'Could not confirm photos.');
  } finally {
   setIsUploading(false);
  }
 };

 const filteredCatalogue = catalogue.filter(c => 
  !cart.some(cartItem => cartItem.barcode === c.primary_barcode) &&
  (c.name.toLowerCase().includes(search.toLowerCase()) || 
  (c.primary_barcode || '').toLowerCase().includes(search.toLowerCase()))
 );

 if (isLoading) {
  return (
   <SafeAreaView className="flex-1 bg-background justify-center items-center">
    <ActivityIndicator size="large" color="#059669" />
    <Text className="mt-4 text-gray-500 font-semibold">Loading Order Details...</Text>
   </SafeAreaView>
  );
 }

 if (!lpo) return null;

 const itemsToDisplay = isEditing ? cart : (lpo.items || []);
 const isEditable = !lpo.signed_lpo_url;

 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
   {/* Header */}
   <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center justify-between shadow-sm z-10">
    <View className="flex-row items-center flex-1">
     <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2 bg-gray-50 rounded-xl border border-gray-200">
      <ChevronLeft size={20} color="#374151" />
     </TouchableOpacity>
     <Text className="text-xl font-black text-gray-800 ">Order Details</Text>
    </View>
    {isEditable && !isEditing && (
     <TouchableOpacity onPress={toggleEditMode} className="p-2 bg-blue-50 rounded-xl border border-blue-200 flex-row items-center">
      <Edit2 size={16} color="#2563eb" />
      <Text className="ml-1 text-blue-700 font-bold text-sm">Edit</Text>
     </TouchableOpacity>
    )}
   </View>

   <FlatList
    className="flex-1"
    contentContainerStyle={{ padding: 16 }}
    data={itemsToDisplay}
    keyExtractor={(item, index) => item.barcode || `temp-${index}`}
    initialNumToRender={15}
    maxToRenderPerBatch={10}
    windowSize={5}
    ListHeaderComponent={
     <>
      {/* Order Summary Card */}
      <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
       <View className="flex-row items-center gap-3 mb-4">
        <View className="w-12 h-12 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center">
         <FileText size={24} color="#059669" />
        </View>
        <View className="flex-1">
         <Text className="text-2xl font-black text-gray-800">{lpo.lpo_number}</Text>
         <Text className="text-gray-500 font-bold">{lpo.customer_name}</Text>
        </View>
       </View>

       <View className="bg-gray-50 p-4 rounded-2xl mb-4 border border-gray-100">
        <View className="flex-row justify-between mb-2">
         <Text className="text-gray-500 font-semibold text-sm">Status</Text>
         <Text className="text-gray-500 font-semibold text-sm">Delivery Date</Text>
        </View>
        <View className="flex-row justify-between items-center">
         <View className="bg-emerald-100 px-3 py-1 rounded-lg">
          <Text className="text-emerald-800 font-bold text-xs uppercase">{lpo.status}</Text>
         </View>
         {isEditing ? (
          <TouchableOpacity 
           className="bg-white border border-gray-200 rounded-lg px-3 py-1.5"
           onPress={() => setShowDatePicker(true)}
          >
           <Text className="text-gray-800 font-bold text-sm">
            {deliveryDate ? deliveryDate.toISOString().split('T')[0] : 'Select Date'}
           </Text>
          </TouchableOpacity>
         ) : (
          <Text className="text-gray-800 font-black text-sm">
           {lpo.delivery_date ? new Date(lpo.delivery_date).toLocaleDateString() : 'N/A'}
          </Text>
         )}
        </View>
       </View>
       
       {showDatePicker && (
        <DateTimePicker
         value={deliveryDate || new Date()}
         mode="date"
         display="default"
         onChange={(event: any, selectedDate?: Date) => {
          setShowDatePicker(false);
          if (selectedDate) setDeliveryDate(selectedDate);
         }}
        />
       )}

       {!isEditing && (
        <>
         {lpo.signed_lpo_url ? (
          <TouchableOpacity 
           onPress={handleOpenPdf}
           className="bg-emerald-600 py-4 rounded-2xl flex-row items-center justify-center shadow-sm"
          >
           <Download size={18} color="#fff" />
           <Text className="text-white font-black text-base ml-2">View Signed LPO</Text>
          </TouchableOpacity>
         ) : (
          <View className="gap-3">
           <TouchableOpacity 
            onPress={handleDownloadPDF} 
            disabled={isSharing}
            className={`py-4 rounded-2xl flex-row items-center justify-center shadow-sm border ${isSharing ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}
           >
            {isSharing ? <ActivityIndicator color="#374151" /> : (
             <>
              <Download size={18} color="#374151" />
              <Text className="text-gray-700 font-black text-base ml-2">🖨️ Save & Print</Text>
             </>
            )}
           </TouchableOpacity>
           
           <TouchableOpacity 
            onPress={handleUploadClick}
            disabled={isUploading}
            className={`bg-[#003527] py-4 rounded-2xl flex-row items-center justify-center shadow-sm ${isUploading ? 'opacity-75' : ''}`}
           >
            {isUploading ? (
             <>
              <ActivityIndicator color="#fff" />
              <Text className="text-white font-black text-base ml-2">Confirming...</Text>
             </>
            ) : (
             <>
              <UploadCloud size={18} color="#fff" />
              <Text className="text-white font-black text-base ml-2">📷 Take Photos of Signed LPO</Text>
             </>
            )}
           </TouchableOpacity>
          </View>
         )}
        </>
       )}
      </View>

      <View className="flex-row justify-between items-center mb-4">
       <Text className="text-lg font-black text-gray-800 ml-1">Order Items ({itemsToDisplay.length})</Text>
       {isEditing && (
        <TouchableOpacity onPress={() => setShowItemModal(true)} className="bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
         <Text className="text-emerald-700 font-bold text-xs uppercase">+ Add Item</Text>
        </TouchableOpacity>
       )}
      </View>
     </>
    }
    renderItem={({ item, index }) => (
     <CartItemRow 
      item={item}
      index={index}
      isEditing={isEditing}
      removeItem={removeItem}
      decrementQuantity={decrementQuantity}
      updateQuantity={updateQuantity}
      validateQuantityOnBlur={validateQuantityOnBlur}
      incrementQuantity={incrementQuantity}
     />
    )}
    ListEmptyComponent={
     <View className="p-8 items-center justify-center bg-white rounded-3xl border border-gray-200">
      <Text className="text-gray-400 font-semibold">No items found in this order.</Text>
     </View>
    }
    ItemSeparatorComponent={() => <View />}
    ListFooterComponent={<View className="h-8" />}
    style={{ flex: 1 }}
   />
   
   {isEditing && (
    <View className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
     <TouchableOpacity
      className="bg-[#003527] py-4 rounded-2xl flex-row items-center justify-center shadow-md"
      onPress={saveChanges}
      disabled={isSaving}
     >
      {isSaving ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-base uppercase tracking-widest">Save Changes</Text>}
     </TouchableOpacity>
    </View>
   )}

   {/* Item Selection Modal (Only when editing) */}
   <Modal visible={showItemModal} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView className="flex-1 bg-white">
     <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
      <Text className="text-lg font-black text-gray-800">Add Product</Text>
      <TouchableOpacity onPress={() => setShowItemModal(false)} className="px-2 py-1">
       <Text className="text-emerald-700 font-bold text-base">Done</Text>
      </TouchableOpacity>
     </View>
     <View className="p-4 border-b border-gray-100 bg-gray-50">
      <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4">
       <Search size={18} color="#9ca3af" />
       <TextInput
        className="flex-1 py-3 px-2 text-base font-semibold text-gray-800"
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
        className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center bg-white"
        onPress={() => handleSelectFromCatalogue(item)}
       >
        <View className="flex-1 pr-4">
         <Text className="font-bold text-gray-800 text-base mb-1">{item.name}</Text>
         <Text className="text-xs text-gray-500 font-semibold">{item.primary_barcode}</Text>
        </View>
       </TouchableOpacity>
      )}
     />
    </SafeAreaView>
   </Modal>

   {/* Loading Overlay */}
   <Modal visible={isUploading} transparent animationType="fade">
    <View className="flex-1 bg-black/50 items-center justify-center">
     <View className="bg-white p-6 rounded-2xl items-center flex-row shadow-lg">
      <ActivityIndicator size="large" color="#059669" />
      <Text className="ml-4 font-bold text-gray-800 text-base">Confirming LPO Photos...</Text>
     </View>
    </View>
   </Modal>

   {/* Quantity Modal */}
   <Modal 
     visible={quantityModalVisible} 
     transparent 
     animationType="fade"
     onShow={() => {
       // Small delay to ensure modal is fully visible before focusing
       setTimeout(() => quantityInputRef.current?.focus(), 100);
     }}
   >
    <View className="flex-1 bg-black/50 justify-center items-center p-6">
     <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
      <Text className="text-xl font-black text-gray-800 text-center mb-2">Enter Quantity</Text>
      <Text className="text-sm text-gray-500 text-center mb-6" numberOfLines={2}>
       {selectedItemForQuantity?.name}
      </Text>
      
      <TextInput
       ref={quantityInputRef}
       className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center text-3xl font-black text-gray-800 mb-6"
       keyboardType="numeric"
       value={tempQuantity}
       onChangeText={(val) => setTempQuantity(val.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
       autoFocus
       selectTextOnFocus
      />
      
      <View className="flex-row gap-3">
       <TouchableOpacity 
        onPress={() => setQuantityModalVisible(false)}
        className="flex-1 p-4 rounded-xl bg-gray-100 items-center justify-center"
       >
        <Text className="font-bold text-gray-600 text-base">Cancel</Text>
       </TouchableOpacity>
       <TouchableOpacity 
        onPress={confirmQuantity}
        className="flex-1 p-4 rounded-xl bg-[#003527] items-center justify-center"
       >
        <Text className="font-bold text-white text-base">Confirm</Text>
       </TouchableOpacity>
      </View>
     </View>
    </View>
   </Modal>

   <MultiPhotoModal 
     visible={showCameraModal} 
     onClose={() => setShowCameraModal(false)} 
     onConfirm={handleConfirmPhotos} 
   />
  </SafeAreaView>
 );
}
