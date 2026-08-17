import React, { useState, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert, SafeAreaView, Modal } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X, Camera, Check, Trash2, FileText } from "lucide-react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";

export default function MultiPhotoModal({ visible, onClose, onConfirm }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<string[]>([]);
  const [isPreview, setIsPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!visible) {
      setPhotos([]);
      setIsPreview(false);
      setIsProcessing(false);
    }
  }, [visible]);

  if (!visible) return null;

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-[#003527] justify-center items-center">
        <Text className="text-white text-center mb-4 text-lg">We need camera access to attach LPO photos</Text>
        <TouchableOpacity onPress={requestPermission} className="bg-[#003527] border-2 border-white px-6 py-4 rounded-xl">
          <Text className="text-white font-black text-lg">Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} className="mt-8">
          <Text className="text-gray-400 font-bold">Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const takePhoto = async () => {
  if (cameraRef.current) {
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });
      if (photo?.uri) {
        setPhotos([...photos, photo.uri]);
      }
    } catch (err) {
      console.error(err);
    }
  }
};

const removePhoto = (index: number) => {
  setPhotos(photos.filter((_, i) => i !== index));
};

const generatePDFAndConfirm = async () => {
  if (photos.length === 0) return;
  setIsProcessing(true);
  try {
    const base64Photos = await Promise.all(
      photos.map(async (uri) => {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        return `data:image/jpeg;base64,${base64}`;
      })
    );
    
    const imgTags = base64Photos.map(b64 => `<img src="${b64}" style="width: 100%; margin-bottom: 20px; border-radius: 8px;" />`).join("");
    
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body { margin: 0; padding: 20px; font-family: sans-serif; text-align: center; background: #f8fafc; }</style></head><body>${imgTags}</body></html>`;
    
    const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
    
    onConfirm({
      uri: pdfUri,
      mimeType: "application/pdf",
      filename: `lpo-photos-${Date.now()}.pdf`
    });
    
    setPhotos([]);
    setIsPreview(false);
    onClose();
  } catch (err) {
    console.error(err);
    Alert.alert("Error", "Failed to process photos.");
  } finally {
    setIsProcessing(false);
  }
};

return (
  <Modal visible={visible} animationType="slide">
    <SafeAreaView className="flex-1 bg-[#003527]">
      {!isPreview ? (
        <View className="flex-1">
          <View className="flex-row justify-between items-center p-4 z-10 absolute top-0 w-full">
            <TouchableOpacity onPress={onClose} className="w-10 h-10 bg-black/50 rounded-full items-center justify-center">
              <X color="white" size={24} />
            </TouchableOpacity>
            <View className="bg-black/50 px-3 py-1 rounded-full">
              <Text className="text-white font-bold">{photos.length} Photos</Text>
            </View>
          </View>
          
          <View className="flex-1 rounded-3xl overflow-hidden mt-16 mb-4 mx-4">
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          </View>
          
          <View className="p-6 pb-10 flex-row items-center justify-between">
            <View className="w-16" />
            <TouchableOpacity onPress={takePhoto} className="w-20 h-20 rounded-full border-4 border-white items-center justify-center">
              <View className="w-16 h-16 bg-white rounded-full" />
            </TouchableOpacity>
            <TouchableOpacity 
              className={`w-16 h-16 rounded-2xl items-center justify-center ${photos.length > 0 ? "bg-white" : "bg-gray-800"}`}
              disabled={photos.length === 0}
              onPress={() => setIsPreview(true)}
            >
              <Check color={photos.length > 0 ? "#003527" : "#4b5563"} size={28} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-1 bg-white">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
            <TouchableOpacity onPress={() => setIsPreview(false)} className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center">
              <X color="#374151" size={20} />
            </TouchableOpacity>
            <Text className="text-lg font-black text-gray-800">Preview ({photos.length})</Text>
            <View className="w-10" />
          </View>
          
          <ScrollView className="flex-1 p-4">
            {photos.map((uri, index) => (
              <View key={index} className="mb-4 relative">
                <Image source={{ uri }} className="w-full h-80 rounded-2xl" resizeMode="cover" />
                <TouchableOpacity 
                  onPress={() => removePhoto(index)}
                  className="absolute top-4 right-4 w-10 h-10 bg-rose-500 rounded-full items-center justify-center shadow-md"
                >
                  <Trash2 color="white" size={20} />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length === 0 && (
              <View className="py-20 items-center">
                <Text className="text-gray-500 font-bold">No photos taken.</Text>
              </View>
            )}
          </ScrollView>
          
          <View className="p-4 border-t border-gray-200">
            <TouchableOpacity 
              className={`w-full py-4 rounded-2xl flex-row items-center justify-center shadow-sm ${photos.length > 0 ? "bg-[#003527]" : "bg-gray-300"}`}
              disabled={photos.length === 0 || isProcessing}
              onPress={generatePDFAndConfirm}
            >
              {isProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-black text-base uppercase tracking-widest">Confirm Photos</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  </Modal>
);
}
