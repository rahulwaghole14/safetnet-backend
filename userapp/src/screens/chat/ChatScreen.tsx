import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  StatusBar,
  PermissionsAndroid,
  ActivityIndicator,
  Keyboard,
  Modal,
  ToastAndroid,
  Dimensions,
  Image,
  Linking,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useRoute, useNavigation, useTheme} from '@react-navigation/native';
import {useAuthStore} from '../../stores/authStore';
import {apiService} from '../../services/apiService';
import {format} from 'date-fns';
import {
  launchImageLibrary,
  launchCamera,
  ImagePickerResponse,
  MediaType,
  ImageLibraryOptions,
} from 'react-native-image-picker';
import {ThemedAlert} from '../../components/common/ThemedAlert';
import {CameraDisclosureModal} from '../../components/common/CameraDisclosureModal';
import {permissionService} from '../../services/permissionService';
import {getInitials, getAvatarColor} from '../../utils/avatarColors';
import {
  downloadAndStoreFile,
  getStoredFile,
  getSenderFileUri,
  isImageFile,
  isVideoFile,
  initChatFilesDir,
} from '../../utils/fileStorage';
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

let IntentLauncherAndroid: any = null;
if (Platform.OS === 'android') {
  try {
    // RN 0.82+ no longer exports this module by default; wrap in try/catch
    // to avoid bundler errors on platforms where it's unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('react-native/Libraries/Utilities/IntentLauncherAndroid');
    IntentLauncherAndroid = module?.default || module;
  } catch (error) {
    console.warn('IntentLauncherAndroid not available:', error);
    IntentLauncherAndroid = null;
  }
}

interface Message {
  id: string | number;
  text: string;
  sender_id: number;
  sender_name?: string;
  sender_first_name?: string;
  sender_last_name?: string;
  created_at: string;
  isOwn: boolean;
  status?: 'sending' | 'sent' | 'failed';
  retryCount?: number;
  image?: string;
  image_url?: string;
  file?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  localFilePath?: string; // Local path for downloaded files
  downloadStatus?: 'downloading' | 'downloaded' | 'not_downloaded';
  isSelected?: boolean; // For multi-select
  base64_image?: string; // Base64 encoded image for offline display
}

const MAX_FILE_NAME_DISPLAY = 32;

const resolveFileName = (message: Message): string => {
  let fileName = message.file_name;

  // If no file_name, try to extract from URL
  if (!fileName || fileName.trim() === '') {
    if (message.file_url) {
    const urlParts = message.file_url.split('/');
    fileName = urlParts[urlParts.length - 1];
    if (fileName) {
        // Remove query parameters and hash
        fileName = fileName.split('?')[0].split('#')[0];
    }
  }

    if ((!fileName || fileName.trim() === '') && message.image_url) {
    const urlParts = message.image_url.split('/');
    fileName = urlParts[urlParts.length - 1];
    if (fileName) {
        // Remove query parameters and hash
        fileName = fileName.split('?')[0].split('#')[0];
      }
    }
  }

  // Final fallback
  if (!fileName || fileName.trim() === '') {
    fileName = 'Document';
  }

  // Truncate if too long
  if (fileName.length > MAX_FILE_NAME_DISPLAY) {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot > -1) {
      const name = fileName.substring(0, lastDot);
      const ext = fileName.substring(lastDot);
      const truncatedName = name.substring(0, Math.max(8, MAX_FILE_NAME_DISPLAY - ext.length - 3));
      return `${truncatedName}...${ext}`;
    }
    return `${fileName.substring(0, MAX_FILE_NAME_DISPLAY)}...`;
  }

  return fileName;
};

const resolveFileExtension = (message: Message): string => {
  let fileName = message.file_name;
  if (!fileName && message.file_url) {
    const urlParts = message.file_url.split('/');
    fileName = urlParts[urlParts.length - 1].split('?')[0];
  }
  if (!fileName && message.image_url) {
    const urlParts = message.image_url.split('/');
    fileName = urlParts[urlParts.length - 1].split('?')[0];
  }
  const ext = fileName?.includes('.') ? fileName.split('.').pop() : undefined;
  return ext ? ext.toUpperCase() : '';
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

interface GroupMember {
  id: number;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  isAdmin?: boolean;
}

interface GroupDetails {
  id: number;
  name: string;
  description?: string;
  members: GroupMember[];
  created_at: string;
  created_by: number;
}

const ChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const {colors} = theme;
  const isDarkMode = theme.dark || false;
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const {groupId, groupName} = route.params as {groupId: string; groupName: string};

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<FlatList>(null);
  const [alertState, setAlertState] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'error' | 'success' | 'info' | 'warning',
  });
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string | number>>(new Set()); // Multi-select
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const messageRefs = useRef<{[key: string]: View | null}>({});
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCameraDisclosure, setShowCameraDisclosure] = useState(false);
  const [pendingCameraAction, setPendingCameraAction] = useState<(() => void) | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string | number>>(new Set());
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | 'file' | null>(null);
  
  // File preview before sending
  const [filePreviewVisible, setFilePreviewVisible] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{
    uri: string;
    fileName: string;
    fileSize: number;
    type: 'image' | 'file';
    mimeType?: string;
    base64?: string; // Base64 encoded image
  }>>([]);
  const [previewComment, setPreviewComment] = useState('');
  
  // Track failed image loads
  const [failedImages, setFailedImages] = useState<Set<string | number>>(new Set());
  
  const handleRetryImage = useCallback((messageId: string | number) => {
    setFailedImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
    setLoadedImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });
    setLoadingImages((prev) => new Set(prev).add(messageId));
  }, []);
  
  // Track loading states for images and videos
  const [loadingImages, setLoadingImages] = useState<Set<string | number>>(new Set());
  const [loadedImages, setLoadedImages] = useState<Set<string | number>>(new Set()); // Track successfully loaded images
  const [loadingVideos, setLoadingVideos] = useState<Set<string | number>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string | number>>(new Set());
  
  // Track image dimensions for adaptive sizing
  const [imageDimensions, setImageDimensions] = useState<{[key: string]: {width: number; height: number}}>({});
  
  // Base64 storage key
  const BASE64_STORAGE_KEY = 'chat_images_base64';

  const openFileUri = async (uri: string, mimeType?: string): Promise<boolean> => {
    if (!uri) {
      return false;
    }

    const normalizedUri =
      uri.startsWith('file://') ||
      uri.startsWith('content://')
        ? uri
        : uri.startsWith('http') || uri.startsWith('https')
        ? uri
        : `file://${uri}`;

    if (normalizedUri.startsWith('http')) {
      return false;
    }

    if (
      Platform.OS === 'android' &&
      IntentLauncherAndroid &&
      (normalizedUri.startsWith('file://') || normalizedUri.startsWith('content://'))
    ) {
      try {
        await IntentLauncherAndroid.startActivity({
          action: IntentLauncherAndroid.ACTION_VIEW || 'android.intent.action.VIEW',
          data: normalizedUri,
          type: mimeType || '*/*',
          flags: IntentLauncherAndroid.FLAG_GRANT_READ_URI_PERMISSION,
        });
        return true;
      } catch (error) {
        console.warn('IntentLauncherAndroid failed to open file:', error);
      }
    }

    try {
      await Linking.openURL(normalizedUri);
      return true;
    } catch (error) {
      console.warn('Linking failed to open file:', error);
      return false;
    }
  };

  const stripFileScheme = (path: string): string => {
    if (!path) {
      return path;
    }
    return path.startsWith('file://') ? path.replace('file://', '') : path;
  };

  const ensureLocalFilePath = async (message: Message, silentDownload: boolean = false): Promise<string | null> => {
    const fileUrl = message.file_url || message.image_url || '';
    const messageId = message.id;

    const checkPath = async (candidate?: string | null): Promise<string | null> => {
      if (!candidate) return null;
      const normalized = stripFileScheme(candidate);
      try {
        const exists = await RNFS.exists(normalized);
        return exists ? normalized : null;
      } catch {
        return null;
      }
    };

    let localPath = await checkPath(message.localFilePath);

    if (!localPath && fileUrl) {
      const stored = await getStoredFile(messageId, fileUrl);
      localPath = await checkPath(stored?.localPath);
    }

    if (!localPath && fileUrl) {
      localPath = await handleDownloadFile(message, {silent: silentDownload});
    }

    return localPath;
  };

  // Helper function to show truncated toast messages
  const showToast = (message: string, duration: number = ToastAndroid.SHORT) => {
    if (Platform.OS === 'android') {
      // Truncate message to fit in toast (max ~50 characters per line, 2-3 lines)
      const maxLength = 100;
      const truncated = message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
      ToastAndroid.show(truncated, duration);
    }
  };

  // Listen to keyboard events
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Initialize loading state for images when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setLoadingImages((prev) => {
        const newSet = new Set(prev);
        messages.forEach((msg) => {
          // Only initialize loading for actual images (not files) without base64
          const hasImageUrl = !!msg.image_url;
          const hasFileUrl = !!msg.file_url;
          const fileName = msg.file_name || '';
          const isImageFileType = hasFileUrl && fileName && isImageFile(fileName);
          const isImage = hasImageUrl || isImageFileType;
          // Initialize loading state for images that haven't loaded or failed yet
          if (isImage && !msg.base64_image && !newSet.has(msg.id)) {
            newSet.add(msg.id);
          }
        });
        return newSet;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]); // Only re-run when message count changes

  // Load group details and messages from API
  useEffect(() => {
    if (user?.id && groupId) {
      loadGroupData();
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        loadMessages();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [groupId, groupName, user?.id]);

  const loadGroupData = async () => {
    if (!user?.id || !groupId) return;
    try {
      setLoading(true);
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const [groupData, messagesData] = await Promise.all([
        apiService.getChatGroupDetails(userIdNum, groupIdNum),
        apiService.getChatMessages(userIdNum, groupIdNum),
      ]);

      setGroupDetails({
        id: groupData.id,
        name: groupData.name,
        description: groupData.description,
        created_at: groupData.created_at,
        created_by: groupData.created_by,
        members: groupData.members || [],
      });

      // Check for stored files and update download status
      const formattedMessages: Message[] = await Promise.all(
        (messagesData || []).map(async (msg: any) => {
          const isOwn = msg.sender_id === userIdNum;
          let localFilePath: string | undefined;
          let downloadStatus: 'downloading' | 'downloaded' | 'not_downloaded' = 'not_downloaded';
          let file_name = msg.file_name;
          
          // For receivers, check if file is already downloaded
          if (!isOwn && (msg.file_url || msg.image_url)) {
            const stored = await getStoredFile(msg.id, msg.file_url || msg.image_url || '');
            if (stored) {
              localFilePath = stored.localPath;
              downloadStatus = 'downloaded';
              // Use stored original file name if message doesn't have file_name
              if (!file_name && stored.originalFileName) {
                file_name = stored.originalFileName;
              }
            }
          }
          
          return {
            id: msg.id,
            text: msg.text || '',
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            sender_first_name: msg.sender_first_name || '',
            sender_last_name: msg.sender_last_name || '',
            created_at: msg.created_at,
            isOwn,
            image: msg.image,
            image_url: msg.image_url,
            file: msg.file,
            file_url: msg.file_url,
            file_name: file_name || undefined,
            file_size: msg.file_size || undefined,
            localFilePath,
            downloadStatus,
          };
          
          // Debug log for file messages
          if (msg.file_url && !msg.image_url) {
            console.log(`[Chat] File message ${msg.id}:`, {
              file_name: file_name,
              file_size: msg.file_size,
              file_url: msg.file_url,
            });
          }
        })
      );

      setMessages(formattedMessages);
      
      // Initialize loading state for images without base64
      setLoadingImages((prev) => {
        const newSet = new Set(prev);
        formattedMessages.forEach((msg) => {
          // Only initialize loading for actual images (not files)
          const hasImageUrl = !!msg.image_url;
          const isImageFile = msg.file_url && msg.file_name && (msg.file_name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i));
          const isImage = hasImageUrl || isImageFile;
          if (isImage && !msg.base64_image && !newSet.has(msg.id)) {
            newSet.add(msg.id);
          }
        });
        return newSet;
      });
    } catch (error: any) {
      console.error('Error loading group data:', error);
      showToast('Failed to load chat. Please try again.', ToastAndroid.LONG);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!user?.id || !groupId) return;
    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      let messagesData;
      try {
        messagesData = await apiService.getChatMessages(userIdNum, groupIdNum);
      } catch (error: any) {
        // If group not found, navigate back
        if (error?.message?.includes('Group not found') || 
            error?.message?.includes('group not found') ||
            error?.message?.includes('404')) {
          showToast('Group not found. It may have been deleted.', ToastAndroid.LONG);
          navigation.goBack();
          return;
        }
        throw error;
      }
      
      // Load base64 images from storage
      let base64Map: {[key: string]: string} = {};
      try {
        const stored = await AsyncStorage.getItem(BASE64_STORAGE_KEY);
        if (stored) {
          base64Map = JSON.parse(stored);
        }
      } catch (error) {
        console.error('Error loading base64 images:', error);
      }
      
      // Check for stored files and update download status
      const formattedMessages: Message[] = await Promise.all(
        (messagesData || []).map(async (msg: any) => {
          const isOwn = msg.sender_id === userIdNum;
          let localFilePath: string | undefined;
          let downloadStatus: 'downloading' | 'downloaded' | 'not_downloaded' = 'not_downloaded';
          let file_name = msg.file_name;
          
          // For receivers, check if file is already downloaded
          if (!isOwn && (msg.file_url || msg.image_url)) {
            const stored = await getStoredFile(msg.id, msg.file_url || msg.image_url || '');
            if (stored) {
              localFilePath = stored.localPath;
              downloadStatus = 'downloaded';
              // Use stored original file name if message doesn't have file_name
              if (!file_name && stored.originalFileName) {
                file_name = stored.originalFileName;
              }
            }
          }
          
          return {
            id: msg.id,
            text: msg.text || '',
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            sender_first_name: msg.sender_first_name || '',
            sender_last_name: msg.sender_last_name || '',
            created_at: msg.created_at,
            isOwn,
            image: msg.image,
            image_url: msg.image_url,
            file: msg.file,
            file_url: msg.file_url,
            file_name: file_name,
            file_size: msg.file_size,
            localFilePath,
            downloadStatus,
            base64_image: base64Map[msg.id] || undefined, // Load base64 if available
          };
        })
      );
      setMessages(formattedMessages);
      
      // Initialize loading state for images without base64
      setLoadingImages((prev) => {
        const newSet = new Set(prev);
        formattedMessages.forEach((msg) => {
          // Only initialize loading for actual images (not files)
          const hasImageUrl = !!msg.image_url;
          const isImageFile = msg.file_url && msg.file_name && (msg.file_name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i));
          const isImage = hasImageUrl || isImageFile;
          if (isImage && !msg.base64_image && !newSet.has(msg.id)) {
            newSet.add(msg.id);
          }
        });
        return newSet;
      });
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({animated: true});
      }, 100);
    }
  }, [messages]);

  const handleSendMessage = async (retryMessage?: Message) => {
    const text = retryMessage?.text || messageText.trim();
    if (!text || !user?.id || !groupId) return;

    setSending(true);
    
    // Store the text to send before clearing input
    const textToSend = text;
    
    // Clear input immediately for new messages (optimistic UI)
    if (!retryMessage) {
      setMessageText('');
    }

    // Create temporary message ID for optimistic UI
    const tempId = retryMessage?.id || `temp_${Date.now()}`;
    const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    const messageToSend: Message = retryMessage || {
      id: tempId,
      text: textToSend,
      sender_id: userIdNum,
      sender_name: user?.name || user?.email || 'User',
      sender_first_name: user?.first_name || '',
      sender_last_name: user?.last_name || '',
      created_at: new Date().toISOString(),
      isOwn: true,
      status: 'sending',
      retryCount: 0,
    };

    // Add message to local state immediately (optimistic update)
    if (!retryMessage) {
      setMessages((prev) => [...prev, messageToSend]);
    } else {
      // Update existing message status
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === retryMessage.id ? {...msg, status: 'sending'} : msg
        )
      );
    }

    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const newMessage = await apiService.sendChatMessage(userIdNum, groupIdNum, textToSend);

      // Store base64 image if available (for sent images)
      let base64Image: string | undefined;
      if (newMessage.image_url && messageToSend.base64_image) {
        base64Image = messageToSend.base64_image;
        // Store in AsyncStorage for offline access
        try {
          const stored = await AsyncStorage.getItem(BASE64_STORAGE_KEY);
          const base64Map = stored ? JSON.parse(stored) : {};
          base64Map[newMessage.id] = base64Image;
          await AsyncStorage.setItem(BASE64_STORAGE_KEY, JSON.stringify(base64Map));
        } catch (error) {
          console.error('Error storing base64 image:', error);
        }
      }
      
      // Update message with server response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId || msg.id === retryMessage?.id
            ? {
                id: newMessage.id,
                text: newMessage.text,
                sender_id: newMessage.sender_id,
                sender_name: newMessage.sender_name,
                sender_first_name: newMessage.sender_first_name || '',
                sender_last_name: newMessage.sender_last_name || '',
                created_at: newMessage.created_at,
                isOwn: true,
                status: 'sent',
                image_url: newMessage.image_url,
                file_url: newMessage.file_url,
                file_name: newMessage.file_name,
                file_size: newMessage.file_size,
                base64_image: base64Image,
              }
            : msg
        )
      );
      
      // Clear input after successful send
      if (!retryMessage) {
        setMessageText('');
      }
      
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Check if it's a network error
      const isNetworkError =
        error?.message?.includes('Network') ||
        error?.message?.includes('network') ||
        error?.message?.includes('fetch') ||
        error?.code === 'NETWORK_ERROR';

      // Update message status to failed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId || msg.id === retryMessage?.id
            ? {
                ...msg,
                status: 'failed',
                retryCount: (msg.retryCount || 0) + 1,
              }
            : msg
        )
      );

      // Don't restore message text on error - keep input cleared
      // User can retry from the failed message UI

      const errorMsg = isNetworkError
        ? 'Network error. Check connection and tap Resend.'
        : error?.response?.data?.error || error?.message || 'Failed to send message. Please try again.';
      showToast(errorMsg, ToastAndroid.LONG);
    } finally {
      setSending(false);
      // Ensure input is always cleared after send attempt (only for new messages, not retries)
      if (!retryMessage) {
        // Use requestAnimationFrame to ensure state update happens after render
        requestAnimationFrame(() => {
          setMessageText('');
        });
      }
    }
  };

  const handleRetryMessage = (message: Message) => {
    if (message.retryCount && message.retryCount >= 3) {
      showToast('Max retries reached. Check your connection.', ToastAndroid.LONG);
      return;
    }
    handleSendMessage(message);
  };

  const handleLongPress = (message: Message) => {
    if (isMultiSelectMode) {
      // Toggle selection in multi-select mode
      toggleMessageSelection(message);
    } else {
      // Enter multi-select mode for own messages
      if (message.isOwn && message.status !== 'sending') {
        setIsMultiSelectMode(true);
        setSelectedMessages(new Set([message.id]));
        setSelectedMessage(null);
      }
    }
  };

  const toggleMessageSelection = (message: Message) => {
    if (!isMultiSelectMode) return;
    
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(message.id)) {
      newSelected.delete(message.id);
    } else {
      newSelected.add(message.id);
    }
    setSelectedMessages(newSelected);
    if (newSelected.size === 0) {
      setIsMultiSelectMode(false);
    }
  };

  const handleMessagePress = (message: Message) => {
    if (isMultiSelectMode) {
      // Toggle selection when in multi-select mode
      toggleMessageSelection(message);
    } else {
      // Normal behavior: open file preview if it's a file/image
      if (message.file_url || message.image_url) {
        handleOpenFile(message);
      }
    }
  };

  const handleToggleMultiSelect = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    setSelectedMessages(new Set());
    setSelectedMessage(null);
  };

  const handleDeleteSelectedMessages = async () => {
    if (selectedMessages.size === 0 || !user?.id) return;
    
    setDeleting(true);
    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      
      const deletePromises = Array.from(selectedMessages).map(async (messageId) => {
        const messageIdNum = typeof messageId === 'string' ? parseInt(messageId, 10) : messageId;
        return apiService.deleteChatMessage(userIdNum, groupIdNum, messageIdNum);
      });
      
      await Promise.all(deletePromises);
      
      // Remove messages from local state
      setMessages((prev) => prev.filter((msg) => !selectedMessages.has(msg.id)));
      
      // Clear selection
      setSelectedMessages(new Set());
      setIsMultiSelectMode(false);
      
      showToast(`${selectedMessages.size} message(s) deleted`);
    } catch (error: any) {
      console.error('Error deleting messages:', error);
      const errorMsg = error?.response?.data?.error || error?.message || 'Failed to delete messages. Please try again.';
      showToast(errorMsg, ToastAndroid.LONG);
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadFile = async (message: Message, options: {silent?: boolean} = {}): Promise<string | null> => {
    const {silent = false} = options;
    if (!message.file_url && !message.image_url) return null;
    
    const fileUrl = message.file_url || message.image_url || '';
    const messageId = message.id;
    
    if (!silent) {
    setDownloadingFiles((prev) => new Set(prev).add(messageId));
    setLoadingFiles((prev) => new Set(prev).add(messageId));
    }
    
    try {
      // Get file name from message, or extract from URL, or use stored file name
      let fileName = message.file_name;
      if (!fileName) {
        if (message.file_url) {
          const urlParts = message.file_url.split('/');
          fileName = urlParts[urlParts.length - 1]?.split('?')[0] || '';
        } else if (message.image_url) {
          const urlParts = message.image_url.split('/');
          fileName = urlParts[urlParts.length - 1]?.split('?')[0] || '';
        }
      }
      // If still no file name, check stored file
      if (!fileName) {
        const stored = await getStoredFile(messageId, fileUrl);
        if (stored?.originalFileName) {
          fileName = stored.originalFileName;
        }
      }
      // Final fallback
      if (!fileName || fileName.trim() === '') {
        fileName = 'file';
      }
      
      const fileSize = message.file_size;
      
      const localPath = await downloadAndStoreFile(messageId, fileUrl, fileName, fileSize);
      
      // Update message with local path
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {...msg, localFilePath: localPath, downloadStatus: 'downloaded'}
            : msg
        )
      );
      
      if (!silent) {
      showToast('File downloaded');
      }
      return localPath;
    } catch (error: any) {
      console.error('Error downloading file:', error);
      if (!silent) {
      showToast('Failed to download file', ToastAndroid.SHORT);
      }
      return null;
    } finally {
      if (!silent) {
      setDownloadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      setLoadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      }
    }
  };

  const handleOpenFile = async (message: Message) => {
    const messageId = message.id;
    setLoadingFiles((prev) => new Set(prev).add(messageId));

      try {
      const localPath = await ensureLocalFilePath(message, true);

      if (!localPath) {
        showToast('File not available', ToastAndroid.SHORT);
        return;
      }

      const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

        const fileName = message.file_name || message.image_url?.split('/').pop() || '';
        const hasImageUrl = !!message.image_url;
        const isImage = hasImageUrl || isImageFile(fileName);
        const isVideo = isVideoFile(fileName);
        
      let mimeType: string | null = getMimeType(fileName);
        if (isImage) mimeType = 'image/*';
        else if (isVideo) mimeType = 'video/*';

      if (isImage || isVideo) {
              setPreviewUri(fileUri);
              setPreviewType(isImage ? 'image' : 'video');
              setPreviewModalVisible(true);
        } else {
        const opened = await openFileUri(fileUri, mimeType || '*/*');
        if (!opened) {
            showToast('No app available to open this file', ToastAndroid.SHORT);
          }
        }
      } catch (error) {
        console.error('Error opening file:', error);
        showToast('Failed to open file', ToastAndroid.SHORT);
    } finally {
      setLoadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  const handleCloseSelection = () => {
    setSelectedMessage(null);
  };

  const closePreviewModal = () => {
    setPreviewModalVisible(false);
    setPreviewUri(null);
    setPreviewType('image');
  };


  const handleEditMessage = () => {
    if (!selectedMessage) return;
    setEditText(selectedMessage.text);
    setEditModalVisible(true);
    setSelectedMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedMessage || !user?.id || !groupId || !editText.trim()) return;
    
    setEditing(true);
    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const messageIdNum = typeof selectedMessage.id === 'string' ? parseInt(selectedMessage.id, 10) : selectedMessage.id;
      
      const updatedMessage = await apiService.editChatMessage(userIdNum, groupIdNum, messageIdNum, editText.trim());
      
      // Update message in local state
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === selectedMessage.id
            ? {
                ...msg,
                text: updatedMessage.text,
                created_at: updatedMessage.created_at,
              }
            : msg
        )
      );
      
      setEditModalVisible(false);
      setEditText('');
      setSelectedMessage(null);
      
      if (Platform.OS === 'android') {
        const ToastAndroid = require('react-native').ToastAndroid;
        ToastAndroid.show('Message updated', ToastAndroid.SHORT);
      }
    } catch (error: any) {
      console.error('Error editing message:', error);
      setAlertState({
        visible: true,
        title: 'Error',
        message: error?.message || 'Failed to edit message. Please try again.',
        type: 'error',
      });
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage || !user?.id || !groupId) return;
    
    setDeleting(true);
    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const messageIdNum = typeof selectedMessage.id === 'string' ? parseInt(selectedMessage.id, 10) : selectedMessage.id;
      
      await apiService.deleteChatMessage(userIdNum, groupIdNum, messageIdNum);
      
      // Remove message from local state
      setMessages((prev) => prev.filter((msg) => msg.id !== selectedMessage.id));
      
      // Close selection mode
      setSelectedMessage(null);
      
      showToast('Message deleted');
    } catch (error: any) {
      console.error('Error deleting message:', error);
      const errorMsg = error?.response?.data?.error || error?.message || 'Failed to delete message. Please try again.';
      showToast(errorMsg, ToastAndroid.LONG);
    } finally {
      setDeleting(false);
    }
  };

  const handleSendPreviewFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0 || !user?.id || !groupId) return;
    
    setSending(true);
    try {
      const groupIdNum = parseInt(groupId, 10);
      const userIdNum = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      
      // Send each file separately with the comment text
      for (const file of selectedFiles) {
        const formData = new FormData();
        
        if (file.type === 'image') {
          const imageFileName = file.fileName || 'image.jpg';
          formData.append('image', {
            uri: file.uri,
            type: file.mimeType || 'image/jpeg',
            name: imageFileName,
          } as any);
          // Explicitly send file_name for images too
          formData.append('file_name', imageFileName);
          // Send file_size for images
          if (file.fileSize) {
            formData.append('file_size', file.fileSize.toString());
          }
          formData.append('text', previewComment.trim());
          
          // Store base64 locally for this image
          if (file.base64) {
            // Will be stored after message is created
          }
        } else {
          // Ensure we have a valid file name
          const fileName = file.fileName || 'file';
          formData.append('file', {
            uri: file.uri,
            type: file.mimeType || 'application/octet-stream',
            name: fileName,  // Use the same file name for the file field
          } as any);
          // Explicitly send file_name separately in FormData
          formData.append('file_name', fileName);
          // Always send file_size - it's required for proper display
          const fileSize = file.fileSize || 0;
          formData.append('file_size', fileSize.toString());
          if (previewComment.trim()) {
            formData.append('text', previewComment.trim());
          }
        }
        
        const newMessage = await apiService.sendChatMessageWithFile(userIdNum, groupIdNum, formData);
        
        // Store original file path for sender (so they can open from local storage)
        if (newMessage.id && file.uri) {
          try {
            const fileUrl = newMessage.image_url || newMessage.file_url || '';
            if (fileUrl) {
              // Store the original local file path
              const originalFileName = file.fileName || 'file';
              const storedFile = {
                messageId: newMessage.id.toString(),
                fileUrl: fileUrl,
                localPath: file.uri.startsWith('file://') ? file.uri : `file://${file.uri}`,
                fileName: originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_'), // Sanitized for storage
                originalFileName: originalFileName, // Preserve original file name
                fileSize: file.fileSize,
                downloadedAt: new Date().toISOString(),
              };
              
              const stored = await AsyncStorage.getItem('chat_file_storage');
              const files = stored ? JSON.parse(stored) : [];
              const existingIndex = files.findIndex(
                (f: any) => f.messageId === newMessage.id.toString() && f.fileUrl === fileUrl
              );
              
              if (existingIndex >= 0) {
                files[existingIndex] = storedFile;
              } else {
                files.push(storedFile);
              }
              
              await AsyncStorage.setItem('chat_file_storage', JSON.stringify(files));
            }
          } catch (error) {
            console.error('Error storing sender file path:', error);
          }
        }
        
        // Store base64 image if available
        if (file.type === 'image' && file.base64 && newMessage.id) {
          try {
            const stored = await AsyncStorage.getItem(BASE64_STORAGE_KEY);
            const base64Map = stored ? JSON.parse(stored) : {};
            base64Map[newMessage.id] = file.base64;
            await AsyncStorage.setItem(BASE64_STORAGE_KEY, JSON.stringify(base64Map));
          } catch (error) {
            console.error('Error storing base64 image:', error);
          }
        }
      }
      
      // Clear preview and reload messages
      setSelectedFiles([]);
      setPreviewComment('');
      setFilePreviewVisible(false);
      setMessageText(''); // Clear main input
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending files:', error);
      const errorMsg = error?.response?.data?.error || error?.message || 'Failed to send files. Please try again.';
      showToast(errorMsg, ToastAndroid.LONG);
    } finally {
      setSending(false);
    }
  };

  const handleImagePicker = () => {
    openImageLibrary();
  };

  const openCamera = async () => {
    try {
      if (Platform.OS === 'android') {
        const isGranted = await permissionService.checkPermission('camera');
        if (!isGranted) {
          return new Promise((resolve) => {
            setPendingCameraAction(() => async () => {
              const granted = await permissionService.requestPermission('camera');
              if (granted) {
                // If granted, proceed with camera launch
                launchCameraWithOptions();
              } else {
                showToast('Camera permission is required', ToastAndroid.SHORT);
              }
              resolve(granted);
            });
            setShowCameraDisclosure(true);
          });
        }
      }
      launchCameraWithOptions();
    } catch (error) {
      console.error('Camera error:', error);
      showToast('Failed to open camera', ToastAndroid.SHORT);
    }
  };

  const launchCameraWithOptions = () => {
    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        includeBase64: false,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorMessage) {
          showToast(response.errorMessage, ToastAndroid.SHORT);
          return;
        }
        if (response.assets && response.assets.length > 0) {
          const asset = response.assets[0];
          handleFileSelected(
            'image',
            asset.uri || '',
            asset.fileName || 'image.jpg',
            asset.fileSize || 0,
          );
        }
      },
    );
  };

  const openImageLibrary = () => {
    try {
      if (!launchImageLibrary) {
        showToast('Image picker not available. Please reinstall app.', ToastAndroid.LONG);
        return;
      }

      const options: ImageLibraryOptions = {
        mediaType: 'photo' as MediaType,
        quality: 0.8,
        includeBase64: false,
        selectionLimit: 0, // Allow multiple selection
        maxWidth: 1920,
        maxHeight: 1920,
      };

      launchImageLibrary(options, (response: ImagePickerResponse) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          let errorMessage = 'Failed to open image library';
          if (response.errorCode === 'permission') {
            errorMessage = 'Permission denied. Grant photo library access.';
          } else if (response.errorCode === 'others') {
            errorMessage = response.errorMessage || errorMessage;
          }
          showToast(errorMessage, ToastAndroid.SHORT);
          return;
        }
        if (response.errorMessage) {
          showToast(response.errorMessage, ToastAndroid.SHORT);
          return;
        }
        if (response.assets && response.assets.length > 0) {
          // Handle multiple images
          response.assets.forEach((asset) => {
            if (asset.uri) {
              handleFileSelected(
                'image',
                asset.uri,
                asset.fileName || 'image.jpg',
                asset.fileSize || 0,
              );
            }
          });
        }
      });
    } catch (error: any) {
      console.error('Image picker error:', error);
      showToast(error?.message || 'Failed to open image library', ToastAndroid.SHORT);
    }
  };


  const getMimeType = (fileName: string): string => {
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: {[key: string]: string} = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'zip': 'application/zip',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
    };
    return mimeTypes[fileExtension] || 'application/octet-stream';
  };

  const convertImageToBase64 = async (uri: string): Promise<string | null> => {
    try {
      const base64 = await RNFS.readFile(uri, 'base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return null;
    }
  };

  const handleFileSelected = async (type: 'image' | 'file', uri: string, fileName: string, fileSize: number) => {
    // Check file size (2 MB limit)
    const maxSize = 2 * 1024 * 1024; // 2 MB in bytes
    if (fileSize > maxSize) {
      showToast('File size exceeds 2 MB limit', ToastAndroid.LONG);
      return;
    }

    // Convert image to base64 if it's an image
    let base64: string | undefined;
    if (type === 'image') {
      const base64Data = await convertImageToBase64(uri);
      if (base64Data) {
        base64 = base64Data;
      }
    }

    // Add to selected files and show preview
    const mimeType = type === 'image' ? 'image/jpeg' : getMimeType(fileName);
    setSelectedFiles((prev) => [...prev, {uri, fileName, fileSize, type, mimeType, base64}]);
    setFilePreviewVisible(true);
  };

  const renderMessage = ({item}: {item: Message}) => {
    const isOwn = item.isOwn;
    const firstName = item.sender_first_name || '';
    const lastName = item.sender_last_name || '';
    const initials = getInitials(firstName, lastName);
    const avatarColor = getAvatarColor(firstName, lastName, item.sender_id);
    const timestamp = new Date(item.created_at);
    const isFailed = item.status === 'failed';
    const messageKey = item.id.toString();
    const isSelected = selectedMessage?.id === item.id;
    const isMultiSelected = selectedMessages.has(item.id);
    const isDownloading = downloadingFiles.has(item.id);
    const hasFile = !!(item.file_url || item.image_url);
    const fileName = item.file_name || item.image_url?.split('/').pop() || '';
    const isImage = item.image_url || (hasFile && isImageFile(fileName));
    const isVideo = hasFile && isVideoFile(fileName);
    const fileExtension = resolveFileExtension(item);
    const displayFileName = resolveFileName(item);
    const formattedFileSize = formatFileSize(item.file_size);
    const isFileLoading = loadingFiles.has(item.id);
    
    // Debug: Log file data for file messages
    if (item.file_url && !item.image_url) {
      console.log(`[Chat] Rendering file message ${item.id}:`, {
        file_name: item.file_name,
        file_size: item.file_size,
        displayFileName,
        formattedFileSize,
        file_url: item.file_url,
        hasFileName: !!item.file_name,
        displayFileNameLength: displayFileName?.length || 0,
        finalDisplayValue: displayFileName || item.file_name || 'Document',
      });
    }
    
    // Determine file URI - prioritize base64, then local path, then URL
    let fileUri = '';
    if (item.base64_image) {
      // Use base64 if available (for offline/fallback)
      fileUri = item.base64_image;
    } else if (item.isOwn) {
      // For sender, use original URL or local path if available
      fileUri = item.image_url || item.file_url || '';
    } else {
      // For receiver, use local path if downloaded, otherwise URL
      fileUri = item.localFilePath || item.image_url || item.file_url || '';
    }
    
    const needsDownload = !item.isOwn && !item.localFilePath && hasFile && !item.base64_image;

    return (
      <View
        ref={(ref) => {
          messageRefs.current[messageKey] = ref;
        }}
        collapsable={false}>
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={() => handleLongPress(item)}
          onPress={() => handleMessagePress(item)}
          style={[
            styles.messageContainer,
            isOwn ? styles.ownMessageContainer : styles.otherMessageContainer,
            (isSelected || isMultiSelected) && {
              backgroundColor: isDarkMode ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.1)',
              borderRadius: 8,
              padding: 4,
            },
          ]}>
          {/* Multi-select checkbox */}
          {isMultiSelectMode && (
            <TouchableOpacity
              style={styles.multiSelectCheckbox}
              onPress={() => toggleMessageSelection(item)}
              activeOpacity={0.7}>
              <MaterialIcons
                name={isMultiSelected ? 'check-box' : 'check-box-outline-blank'}
                size={24}
                color={isMultiSelected ? colors.primary : colors.text}
              />
            </TouchableOpacity>
          )}
        {!isOwn && (
          <View style={[styles.messageAvatar, {backgroundColor: avatarColor}]}>
            <Text style={styles.messageAvatarText}>{initials}</Text>
          </View>
        )}
        <View style={styles.messageBubbleWrapper}>
          {!isOwn && (
            <Text style={[styles.messageSender, {color: colors.text, opacity: 0.7}]}>
              {item.sender_name || 'User'}
            </Text>
          )}
          <View
            style={[
              styles.messageBubble,
              isOwn
                ? {
                    backgroundColor: isFailed ? (isDarkMode ? '#7F1D1D' : '#FEE2E2') : colors.primary,
                    borderBottomRightRadius: 4,
                    alignSelf: 'flex-end',
                    opacity: item.status === 'sending' ? 0.7 : 1,
                  }
                : {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
                    borderBottomLeftRadius: 4,
                    shadowColor: '#000',
                    shadowOffset: {width: 0, height: 1},
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 1,
                  },
            ]}>
            {/* Image Preview */}
            {(isImage || item.image_url) && (fileUri || item.image_url || item.file_url || item.base64_image) && (
              <TouchableOpacity
                onPress={() => {
                  if (isMultiSelectMode) {
                    toggleMessageSelection(item);
                  } else {
                    handleOpenFile(item);
                  }
                }}
                activeOpacity={0.9}
                style={styles.imagePreviewContainer}>
                <View style={styles.imageWrapper}>
                  {/* Show loading overlay until image is loaded (and no base64) */}
                  {!item.base64_image && !loadedImages.has(item.id) && (
                    <View style={[styles.imageLoadingOverlay, {backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)'}]}>
                      <ActivityIndicator size="small" color={isOwn ? '#FFFFFF' : colors.primary} />
                      <Text style={[styles.imageLoadingText, {color: isOwn ? 'rgba(255, 255, 255, 0.9)' : colors.text}]}>
                        Loading...
                      </Text>
                    </View>
                  )}
                  <Image
                    source={{uri: fileUri || item.base64_image || item.image_url || item.file_url || ''}}
                    style={[
                      styles.messageImagePreview,
                      imageDimensions[item.id.toString()] && (() => {
                        const dims = imageDimensions[item.id.toString()];
                        const maxSize = 250; // Max width/height
                        const minSize = 180; // Min size (slightly bigger than square)
                        const baseScale = 0.5; // Scale factor to reduce size
                        
                        // Calculate aspect ratio
                        const aspectRatio = dims.width / dims.height;
                        
                        let width, height;
                        
                        if (aspectRatio > 1) {
                          // Landscape: width is larger
                          width = Math.min(maxSize, Math.max(minSize, dims.width * baseScale));
                          height = width / aspectRatio;
                          // Ensure height doesn't exceed max
                          if (height > maxSize) {
                            height = maxSize;
                            width = height * aspectRatio;
                          }
                        } else {
                          // Portrait or square: height is larger or equal
                          height = Math.min(maxSize, Math.max(minSize, dims.height * baseScale));
                          width = height * aspectRatio;
                          // Ensure width doesn't exceed max
                          if (width > maxSize) {
                            width = maxSize;
                            height = width / aspectRatio;
                          }
                        }
                        
                        return {
                          width: Math.round(width),
                          height: Math.round(height),
                        };
                      })(),
                      !item.base64_image && (loadingImages.has(item.id) || (!loadedImages.has(item.id) && !failedImages.has(item.id))) && {opacity: 0},
                    ]}
                    resizeMode="contain"
                    onLoadStart={() => {
                      // Don't set loading state for base64 images - they load instantly
                      if (!item.base64_image) {
                        // Always set loading state when starting to load
                        setLoadingImages((prev) => new Set(prev).add(item.id));
                        // Clear failed and loaded states when starting to load
                        setFailedImages((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(item.id);
                          return newSet;
                        });
                        setLoadedImages((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(item.id);
                          return newSet;
                        });
                      } else {
                        // For base64, mark as loaded immediately since they don't need network
                        setLoadedImages((prev) => new Set(prev).add(item.id));
                        setLoadingImages((prev) => {
                          const newSet = new Set(prev);
                          newSet.delete(item.id);
                          return newSet;
                        });
                      }
                    }}
                    onLoad={(e) => {
                      // Image loaded successfully
                      setLoadingImages((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                      });
                      setFailedImages((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                      });
                      setLoadedImages((prev) => new Set(prev).add(item.id));
                      // Store actual image dimensions for adaptive sizing
                      const {width, height} = e.nativeEvent.source;
                      if (width && height) {
                        setImageDimensions((prev) => ({
                          ...prev,
                          [item.id.toString()]: {width, height},
                        }));
                      }
                    }}
                    onError={() => {
                      // Image failed to load - only mark as failed if no base64 backup
                      setLoadingImages((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                      });
                      setLoadedImages((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                      });
                      // Only track as failed if base64 is not available
                      if (!item.base64_image) {
                        setFailedImages((prev) => new Set(prev).add(item.id));
                      }
                    }}
                  />
                </View>
                {isVideo && !failedImages.has(item.id) && (
                  <View style={styles.videoPlayOverlay}>
                    <MaterialIcons name="play-circle-filled" size={48} color="#FFFFFF" />
                  </View>
                )}
                {/* File name and type overlay for images */}
                {item.file_name && (
                  <View style={styles.fileNameOverlay}>
                    <Text style={styles.fileNameOverlayText} numberOfLines={1}>
                      {item.file_name}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            
            {/* Video Preview */}
            {isVideo && fileUri && !isImage && (
              <TouchableOpacity
                onPress={() => {
                  if (isMultiSelectMode) {
                    toggleMessageSelection(item);
                  } else {
                    handleOpenFile(item);
                  }
                }}
                activeOpacity={0.9}
                style={styles.videoPreviewContainer}>
                {loadingVideos.has(item.id) && (
                  <View style={[styles.videoLoadingOverlay, {backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.3)'}]}>
                    <ActivityIndicator size="small" color={isOwn ? '#FFFFFF' : colors.primary} />
                    <Text style={[styles.videoLoadingText, {color: isOwn ? 'rgba(255, 255, 255, 0.9)' : colors.text}]}>
                      Loading...
                    </Text>
                  </View>
                )}
                <Image
                  source={{uri: fileUri}}
                  style={[styles.messageImage, loadingVideos.has(item.id) && styles.videoLoading]}
                  resizeMode="cover"
                  onLoadStart={() => {
                    setLoadingVideos((prev) => new Set(prev).add(item.id));
                  }}
                  onLoad={() => {
                    setLoadingVideos((prev) => {
                      const newSet = new Set(prev);
                      newSet.delete(item.id);
                      return newSet;
                    });
                  }}
                  onError={() => {
                    setLoadingVideos((prev) => {
                      const newSet = new Set(prev);
                      newSet.delete(item.id);
                      return newSet;
                    });
                  }}
                />
                <View style={styles.videoPlayOverlay}>
                  <MaterialIcons name="play-circle-filled" size={48} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
            
            {/* File Attachment */}
            {item.file_url && !isImage && !isVideo && (
              <View style={styles.fileAttachmentContainer}>
                <TouchableOpacity
                  style={[
                    styles.messageFile,
                    {
                      backgroundColor: isOwn
                        ? 'rgba(255, 255, 255, 0.2)'
                        : isDarkMode
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.05)',
                    },
                  ]}
                  onPress={() => {
                    if (isMultiSelectMode) {
                      toggleMessageSelection(item);
                    } else {
                      handleOpenFile(item);
                    }
                  }}
                  activeOpacity={0.7}>
                  <View style={styles.messageFileIconContainer}>
                    <MaterialIcons name="insert-drive-file" size={24} color={isOwn ? '#FFFFFF' : colors.primary} />
                    {fileExtension ? (
                      <Text
                        style={[
                          styles.messageFileTypeText,
                          {color: isOwn ? 'rgba(255, 255, 255, 0.9)' : colors.text},
                        ]}>
                        {fileExtension.toUpperCase()}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.messageFileInfo}>
                    <View style={styles.messageFileDetails}>
                  <Text
                    style={[
                      styles.messageFileName,
                          {
                            color: isOwn ? '#FFFFFF' : colors.text,
                          },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail">
                        {displayFileName || item.file_name || 'Document'}
                  </Text>
                  {item.file_size && item.file_size > 0 ? (
                    <Text
                      style={[
                        styles.messageFileSize,
                            {color: isOwn ? 'rgba(255, 255, 255, 0.75)' : colors.text, opacity: 0.8},
                      ]}>
                      {formattedFileSize}
                    </Text>
                  ) : null}
                    </View>
                  <View style={styles.messageFileAction}>
                    {isFileLoading ? (
                    <ActivityIndicator size="small" color={isOwn ? '#FFFFFF' : colors.primary} />
                  ) : needsDownload ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDownloadFile(item);
                      }}
                      disabled={isDownloading}
                      activeOpacity={0.7}>
                      {isDownloading ? (
                        <ActivityIndicator size="small" color={isOwn ? '#FFFFFF' : colors.primary} />
                      ) : (
                        <MaterialIcons name="download" size={20} color={isOwn ? '#FFFFFF' : colors.primary} />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <MaterialIcons name="open-in-new" size={20} color={isOwn ? '#FFFFFF' : colors.primary} />
                  )}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Message Text */}
            {item.text && (
              <Text
                style={[
                  styles.messageText,
                  (isImage || isVideo || item.file_url) && styles.messageTextWithMedia,
                  isOwn
                    ? isFailed
                      ? {color: isDarkMode ? '#FCA5A5' : '#991B1B'}
                      : styles.ownMessageText
                    : {color: colors.text},
                ]}
                numberOfLines={undefined}
                ellipsizeMode="tail">
                {item.text.length > 10 && !item.text.includes(' ') ? item.text.substring(0, 10) + '...' : item.text}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.messageTimeContainer,
              {
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: isOwn ? 'flex-end' : 'flex-start',
                gap: 8,
              },
            ]}>
            <Text
              style={[
                styles.messageTime,
                {
                  color: colors.text,
                  opacity: 0.5,
                },
              ]}>
              {format(timestamp, 'h:mm a')}
            </Text>
            {isOwn && item.status === 'sending' && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
            {isOwn && isFailed && (
              <TouchableOpacity
                onPress={() => handleRetryMessage(item)}
                style={styles.retryButton}
                activeOpacity={0.7}>
                <MaterialIcons name="refresh" size={16} color={colors.primary} />
                <Text style={[styles.retryText, {color: colors.primary}]}>Resend</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <StatusBar
          barStyle={isDarkMode ? 'light-content' : 'dark-content'}
          backgroundColor={colors.card}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={colors.card}
      />
      {/* Group Header or Selection Header */}
      {isMultiSelectMode ? (
        <View
          style={[
            styles.selectionHeader,
            {
              paddingTop: insets.top + 12,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}>
          <TouchableOpacity
            style={styles.selectionCloseButton}
            onPress={handleToggleMultiSelect}
            activeOpacity={0.7}>
            <MaterialIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.selectionCount, {color: colors.text}]}>
            {selectedMessages.size} selected
          </Text>
          <TouchableOpacity
            style={[styles.selectionActionButton, {borderColor: '#EF4444'}]}
            onPress={handleDeleteSelectedMessages}
            activeOpacity={0.7}
            disabled={deleting || selectedMessages.size === 0}>
            {deleting ? (
              <ActivityIndicator size="small" color={'#EF4444'} />
            ) : (
              <MaterialIcons name="delete" size={20} color={'#EF4444'} />
            )}
            <Text style={[styles.selectionActionText, {color: '#EF4444'}]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      ) : selectedMessage ? (
        <View
          style={[
            styles.selectionHeader,
            {
              paddingTop: insets.top + 12,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}>
          <TouchableOpacity
            style={styles.selectionCloseButton}
            onPress={handleCloseSelection}
            activeOpacity={0.7}>
            <MaterialIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[styles.selectionActionButton, {borderColor: colors.border}]}
              onPress={handleEditMessage}
              activeOpacity={0.7}>
              <MaterialIcons name="edit" size={20} color={colors.text} />
              <Text style={[styles.selectionActionText, {color: colors.text}]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionActionButton, {borderColor: '#EF4444'}]}
              onPress={handleDeleteMessage}
              activeOpacity={0.7}
              disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color={'#EF4444'} />
              ) : (
                <MaterialIcons name="delete" size={20} color={'#EF4444'} />
              )}
              <Text style={[styles.selectionActionText, {color: '#EF4444'}]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.groupHeader,
            {
              paddingTop: insets.top + 12,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.groupHeaderButton}
            onPress={() => navigation.navigate('GroupDetails', {groupId, groupName})}
            activeOpacity={0.7}>
            <View
              style={[
                styles.groupHeaderAvatar,
                {backgroundColor: isDarkMode ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'},
              ]}>
              <MaterialIcons name="groups" size={24} color={colors.primary} />
            </View>
            <View style={styles.groupHeaderInfo}>
              <Text style={[styles.groupHeaderName, {color: colors.text}]}>{groupName}</Text>
              <Text style={[styles.groupHeaderMembers, {color: colors.text, opacity: 0.7}]}>
                {groupDetails?.members.length || 0} members
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={colors.text} style={{opacity: 0.5}} />
          </TouchableOpacity>
        </View>
      )}

      {/* Loading Overlay */}
      {loading && messages.length === 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, {color: colors.text}]}>Loading messages...</Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={scrollViewRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.messagesList}
        inverted={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({animated: true})}
        keyboardShouldPersistTaps="handled"
        style={{flex: 1}}
      />

      {/* Message Input - Wrapped in KeyboardAvoidingView */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled>
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: insets.bottom + 8,
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}>
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={handleImagePicker}
              activeOpacity={0.7}>
              <MaterialIcons name="image" size={24} color={colors.text} style={{opacity: 0.7}} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={openCamera}
              activeOpacity={0.7}>
              <MaterialIcons name="photo-camera" size={24} color={colors.text} style={{opacity: 0.7}} />
            </TouchableOpacity>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F9FAFB',
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Type a message..."
              value={messageText}
              onChangeText={setMessageText}
              multiline
              placeholderTextColor={isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#9CA3AF'}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                {
                  backgroundColor: messageText.trim() && !sending ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleSendMessage()}
              disabled={!messageText.trim() || sending}
              activeOpacity={0.7}>
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <MaterialIcons
                  name="send"
                  size={24}
                  color={messageText.trim() ? '#FFFFFF' : (isDarkMode ? 'rgba(255, 255, 255, 0.3)' : '#9CA3AF')}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Preview Modal */}
      <Modal
        visible={previewModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closePreviewModal}>
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalHeader}>
          <TouchableOpacity
              style={styles.previewModalAction}
              onPress={closePreviewModal}
            activeOpacity={0.7}>
            <MaterialIcons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          </View>
          {previewType === 'image' && previewUri && (
            <Image
              source={{uri: previewUri}}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
          {previewType === 'video' && previewUri && (
            <Video
              source={{uri: previewUri}}
              style={styles.previewVideo}
              controls={true}
              resizeMode="contain"
            />
          )}
          {previewType === 'file' && previewUri && (
            <View style={styles.previewFileContainer}>
              <MaterialIcons name="insert-drive-file" size={64} color={colors.primary} />
              <Text style={[styles.previewFileText, {color: colors.text}]}>
                File preview
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* File Preview Modal - Before Sending */}
      <Modal
        visible={filePreviewVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          setFilePreviewVisible(false);
          setSelectedFiles([]);
          setPreviewComment('');
        }}>
        <View style={[styles.filePreviewContainer, {backgroundColor: colors.background}]}>
          <StatusBar
            barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            backgroundColor={colors.card}
          />
          {/* Header */}
          <View style={[styles.filePreviewHeader, {backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 12}]}>
            <TouchableOpacity
              onPress={() => {
                setFilePreviewVisible(false);
                setSelectedFiles([]);
                setPreviewComment('');
              }}
              activeOpacity={0.7}>
              <MaterialIcons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.filePreviewTitle, {color: colors.text}]}>
              Preview ({selectedFiles?.length || 0} {selectedFiles?.length === 1 ? 'file' : 'files'})
            </Text>
            <View style={{width: 24}} />
          </View>

          {/* File List */}
          <FlatList
            data={selectedFiles || []}
            keyExtractor={(item, index) => `preview-${index}-${item.uri}`}
            renderItem={({item, index}) => (
              <View style={styles.filePreviewItem}>
                {item.type === 'image' ? (
                  <Image
                    source={{uri: item.base64 || item.uri}}
                    style={styles.filePreviewImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.filePreviewFileContainer, {backgroundColor: colors.card}]}>
                    <MaterialIcons name="insert-drive-file" size={48} color={colors.primary} />
                    <Text style={[styles.filePreviewFileName, {color: colors.text}]} numberOfLines={1}>
                      {item.fileName}
                    </Text>
                    <Text style={[styles.filePreviewFileSize, {color: colors.text, opacity: 0.7}]}>
                      {(item.fileSize / (1024 * 1024)).toFixed(2)} MB
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.filePreviewRemove}
                  onPress={() => {
                    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
                  }}
                  activeOpacity={0.7}>
                  <MaterialIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.filePreviewList,
              (selectedFiles?.length || 0) === 1 && {
                justifyContent: 'center',
                paddingLeft: Math.max(16, (Dimensions.get('window').width - 200) / 2),
              },
            ]}
          />

          {/* Input Bar */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
            <View style={[styles.filePreviewInputContainer, {backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12}]}>
              <TextInput
                style={[
                  styles.filePreviewInput,
                  {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F9FAFB',
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="Add a comment (optional)..."
                value={previewComment}
                onChangeText={setPreviewComment}
                multiline
                placeholderTextColor={isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#9CA3AF'}
              />
              <TouchableOpacity
                style={[
                  styles.filePreviewSendButton,
                  {
                    backgroundColor: !sending ? colors.primary : colors.border,
                  },
                ]}
                onPress={handleSendPreviewFiles}
                disabled={sending}
                activeOpacity={0.7}>
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialIcons name="send" size={24} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ThemedAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={[{text: 'OK', onPress: () => setAlertState({...alertState, visible: false})}]}
        onDismiss={() => setAlertState({...alertState, visible: false})}
      />

      {/* Camera Prominent Disclosure Modal */}
      <CameraDisclosureModal
        visible={showCameraDisclosure}
        onAccept={async () => {
          setShowCameraDisclosure(false);
          if (pendingCameraAction) {
            pendingCameraAction();
            setPendingCameraAction(null);
          }
        }}
        onDecline={() => {
          setShowCameraDisclosure(false);
          setPendingCameraAction(null);
        }}
      />

      {/* Edit Message Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditText('');
          setSelectedMessage(null);
        }}>
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModal, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <View style={[styles.editModalHeader, {borderBottomColor: colors.border}]}>
              <Text style={[styles.editModalTitle, {color: colors.text}]}>Edit Message</Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setEditText('');
                  setSelectedMessage(null);
                }}
                activeOpacity={0.7}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.editInput,
                {
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F9FAFB',
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder="Edit your message..."
              placeholderTextColor={isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#9CA3AF'}
              autoFocus
            />
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={[styles.editModalButton, styles.editModalCancelButton, {borderColor: colors.border}]}
                onPress={() => {
                  setEditModalVisible(false);
                  setEditText('');
                  setSelectedMessage(null);
                }}
                activeOpacity={0.7}>
                <Text style={[styles.editModalButtonText, {color: colors.text}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editModalButton,
                  styles.editModalSaveButton,
                  {
                    backgroundColor: editText.trim() && !editing ? colors.primary : colors.border,
                  },
                ]}
                onPress={handleSaveEdit}
                disabled={!editText.trim() || editing}
                activeOpacity={0.7}>
                {editing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.editModalSaveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  groupHeaderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupHeaderInfo: {
    flex: 1,
  },
  groupHeaderName: {
    fontSize: 16,
    fontWeight: '600',
  },
  groupHeaderMembers: {
    fontSize: 12,
    marginTop: 2,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  ownMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  messageBubbleWrapper: {
    flex: 1,
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    minWidth: 0, // Allow shrinking
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextWithMedia: {
    marginTop: 8,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageImagePreview: {
    width: 200,
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'transparent',
    maxWidth: 250,
    maxHeight: 250,
  },
  imageErrorContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    width: 200,
    height: 200,
    maxWidth: 250,
    maxHeight: 250,
  },
  imageErrorText: {
    marginTop: 8,
    fontSize: 12,
  },
  imageRetryText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
  },
  fileNameOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    maxWidth: '80%',
  },
  fileNameOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  fileTypeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileTypeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  fileAttachmentContainer: {
    width: '100%',
    maxWidth: '100%',
    marginBottom: 8,
  },
  messageFile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
    position: 'relative',
  },
  messageFileIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  messageFileInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  messageFileDetails: {
    flex: 1,
    minWidth: 0,
  },
  messageFileTypeText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.8,
  },
  messageFileAction: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageFileName: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
    color: '#FFFFFF', // Default white, overridden inline when needed
    includeFontPadding: false,
  },
  messageFileSize: {
    fontSize: 12,
    opacity: 0.8,
  },
  messageFileTypeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginHorizontal: 8,
  },
  messageFileTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  multiSelectCheckbox: {
    padding: 8,
    marginRight: 8,
  },
  multiSelectButton: {
    padding: 8,
    marginLeft: 8,
  },
  selectionCount: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: 12,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 8,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    maxWidth: 250,
    maxHeight: 250,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    borderRadius: 8,
  },
  imageLoadingText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  imageLoading: {
    opacity: 0.5,
  },
  videoLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    borderRadius: 8,
  },
  videoLoadingText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  videoLoading: {
    opacity: 0.5,
  },
  videoPreviewContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  previewModalHeader: {
    position: 'absolute',
    top: 40,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 3,
  },
  previewModalAction: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  previewModalActionPlaceholder: {
    width: 36,
    height: 36,
  },
  previewImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  previewVideo: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.6,
  },
  previewFileContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  previewFileText: {
    marginTop: 16,
    fontSize: 16,
  },
  messageTimeContainer: {
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    paddingHorizontal: 4,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  attachButton: {
    padding: 8,
    marginRight: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    marginRight: 8,
    marginLeft: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  selectionCloseButton: {
    padding: 8,
    marginRight: 12,
  },
  selectionActions: {
    flexDirection: 'row',
    flex: 1,
    gap: 12,
    alignItems: 'center',
  },
  selectionActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  selectionActionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  editModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  editInput: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 100,
    maxHeight: 200,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  editModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  editModalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalCancelButton: {
    borderWidth: 1,
  },
  editModalSaveButton: {
    // backgroundColor set dynamically
  },
  editModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editModalSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  filePreviewContainer: {
    flex: 1,
  },
  filePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filePreviewTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  filePreviewList: {
    padding: 16,
    alignItems: 'center',
  },
  filePreviewItem: {
    marginRight: 12,
    position: 'relative',
  },
  filePreviewImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  filePreviewFileContainer: {
    width: 200,
    height: 200,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  filePreviewFileName: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  filePreviewFileSize: {
    fontSize: 12,
    marginTop: 4,
  },
  filePreviewRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewInputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  filePreviewInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
  },
  filePreviewSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatScreen;
