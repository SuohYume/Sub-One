<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent, type PropType } from 'vue';
import { batchUpdateNodes } from '../../lib/api';
import { extractNodeName } from '../../lib/utils';
import { useToastStore } from '../../stores/toast';
import { useUIStore } from '../../stores/ui';
import { useSubscriptions } from '../../composables/useSubscriptions';
import { useManualNodes } from '../../composables/useManualNodes';
import { useProfiles } from '../../composables/useProfiles';
import { useAppPersistence } from '../../composables/useAppPersistence';
import { HTTP_REGEX } from '../../lib/constants';
import { parseImportText, createSubscription, createNode } from '../../lib/importer';

import type { Subscription, Profile, Node as AppNode, AppConfig, InitialData } from '../../types';

import DashboardHome from '../tabs/DashboardHome.vue';
import SubscriptionsTab from '../tabs/SubscriptionsTab.vue';
import ProfilesTab from '../tabs/ProfilesTab.vue';
import NodesTab from '../tabs/NodesTab.vue';
import GeneratorTab from '../tabs/GeneratorTab.vue';
import Modal from '../modals/BaseModal.vue';
import SubscriptionImportModal from '../modals/SubscriptionImportModal.vue';
import NodeDetailsModal from '../modals/NodeDetailsModal.vue';
import NodeFilterEditor from '../editors/NodeFilterEditor.vue';

const SettingsModal = defineAsyncComponent(() => import('../modals/SettingsModal.vue'));
const BulkImportModal = defineAsyncComponent(() => import('../modals/BulkImportModal.vue'));
const ProfileModal = defineAsyncComponent(() => import('../modals/ProfileModal.vue'));

// --- 基礎 Props 和狀態 ---
const props = defineProps({
  data: {
    type: Object as PropType<InitialData | null>,
    required: false
  },
  activeTab: {
    type: String,
    default: 'subscriptions'
  }
});

// 定义组件的emit事件
const emit = defineEmits(['update-data']);
const { showToast } = useToastStore();
const uiStore = useUIStore();
const isLoading = ref(true);

// --- 初始化状态 ---
const initialSubs = ref<Subscription[]>([]);
const initialNodes = ref<AppNode[]>([]);
const config = ref<AppConfig>({});

// --- Composables ---
const {
  subscriptions, subsCurrentPage, subsTotalPages, paginatedSubscriptions,
  changeSubsPage, addSubscription, updateSubscription, deleteSubscription, deleteAllSubscriptions,
  addSubscriptionsFromBulk, handleUpdateNodeCount,
} = useSubscriptions(initialSubs);

const {
  manualNodes, manualNodesCurrentPage, manualNodesTotalPages, paginatedManualNodes, searchTerm,
  changeManualNodesPage, addNode, updateNode, deleteNode, deleteAllNodes,
  addNodesFromBulk, autoSortNodes, deduplicateNodes,
} = useManualNodes(initialNodes);

const {
  profiles, profilesCurrentPage, profilesTotalPages, paginatedProfiles, activeProfiles,
  changeProfilesPage, initializeProfiles, addProfile, updateProfile, 
  deleteProfile, toggleProfile, deleteAllProfiles, batchDeleteProfiles, copyProfileLink,
  removeIdFromProfiles, clearProfilesField
} = useProfiles(config);

const {
  dirty, handleDirectSave,
} = useAppPersistence(subscriptions, manualNodes, profiles, config);

// --- Dashboard Statistics ---
const activeSubscriptions = computed(() => subscriptions.value.filter(sub => sub.enabled).length);
const activeManualNodes = computed(() => manualNodes.value.filter(node => node.enabled).length);
const totalNodeCount = computed(() => {
  let count = manualNodes.value.length;
  subscriptions.value.forEach(sub => {
    if (sub.nodeCount) count += sub.nodeCount;
  });
  return count;
});
const activeNodeCount = computed(() => {
  let count = manualNodes.value.filter(node => node.enabled).length;
  subscriptions.value.forEach(sub => {
    if (sub.enabled && sub.nodeCount) count += sub.nodeCount;
  });
  return count;
});

// --- Sorting State ---
const isSortingSubs = ref(false);
const isSortingNodes = ref(false);
const hasUnsavedSortChanges = ref(false);

const handleToggleSortSubs = () => {
  if (isSortingSubs.value && hasUnsavedSortChanges.value && !confirm('有未保存的排序更改，确定要退出吗？')) return;
  isSortingSubs.value = !isSortingSubs.value;
  if (!isSortingSubs.value) hasUnsavedSortChanges.value = false;
};

const handleToggleSortNodes = () => {
  if (isSortingNodes.value && hasUnsavedSortChanges.value && !confirm('有未保存的排序更改，确定要退出吗？')) return;
  isSortingNodes.value = !isSortingNodes.value;
  if (!isSortingNodes.value) hasUnsavedSortChanges.value = false;
};

const handleSaveSortChanges = async () => {
  if (await handleDirectSave('排序')) {
     hasUnsavedSortChanges.value = false;
  }
};

const handleSubscriptionDragEnd = () => { hasUnsavedSortChanges.value = true; };
const handleNodeDragEnd = () => { hasUnsavedSortChanges.value = true; };

// --- Modals State ---
const editingSubscription = ref<Subscription | null>(null);
const isNewSubscription = ref(false);
const showSubModal = ref(false);

const editingNode = ref<AppNode | null>(null);
const isNewNode = ref(false);
const showNodeModal = ref(false);

const isNewProfile = ref(false);
const editingProfile = ref<Profile | null>(null);
const showProfileModal = ref(false);

const showBulkImportModal = ref(false);
const showDeleteSubsModal = ref(false);
const showDeleteNodesModal = ref(false);
const showDeleteSingleSubModal = ref(false);
const showDeleteSingleNodeModal = ref(false);
const showDeleteSingleProfileModal = ref(false);
const showDeleteProfilesModal = ref(false);
const showSubscriptionImportModal = ref(false);
const showNodeDetailsModal = ref(false);
const selectedSubscription = ref<Subscription | null>(null);
const selectedProfile = ref<Profile | null>(null);
const isUpdatingAllSubs = ref(false);
const deletingItemId = ref<string | null>(null);

// --- 帮助函数：触发数据更新 ---
const triggerDataUpdate = () => {
  emit('update-data', {
    subs: [...subscriptions.value, ...manualNodes.value]
  });
};

// --- 初始化 ---
const initializeState = () => {
  isLoading.value = true;
  if (props.data) {
    const subsData = props.data.subs || [];
    // 分离订阅和节点
    initialSubs.value = subsData.filter(item => item.url && HTTP_REGEX.test(item.url)) as Subscription[];
    initialNodes.value = subsData.filter(item => !item.url || !HTTP_REGEX.test(item.url)) as AppNode[];
    
    // 初始化订阅组
    initializeProfiles(props.data.profiles || []);
    config.value = props.data.config || {};
  }
  isLoading.value = false;
  dirty.value = false;
};

onMounted(() => {
  try {
    initializeState();
  } catch (error) {
    console.error('初始化数据失败:', error);
    showToast('初始化数据失败', 'error');
  } finally {
    isLoading.value = false;
  }
});



// --- 订阅操作 ---
const handleAddSubscription = () => {
  isNewSubscription.value = true;
  editingSubscription.value = createSubscription('');
  showSubModal.value = true;
};

const handleEditSubscription = (subId: string) => {
  const sub = subscriptions.value.find(s => s.id === subId);
  if (sub) {
    isNewSubscription.value = false;
    editingSubscription.value = { ...sub };
    showSubModal.value = true;
  }
};

const handleSaveSubscription = async () => {
  if (!editingSubscription.value?.url) return showToast('订阅链接不能为空', 'error');
  if (!HTTP_REGEX.test(editingSubscription.value.url)) return showToast('请输入有效的 http:// 或 https:// 订阅链接', 'error');

  let updatePromise = null;
  if (isNewSubscription.value) {
    updatePromise = addSubscription({ ...editingSubscription.value, id: crypto.randomUUID() });
  } else {
    updateSubscription(editingSubscription.value);
  }

  await handleDirectSave('订阅');
  triggerDataUpdate();
  showSubModal.value = false;

  if (updatePromise && await updatePromise) {
    await handleDirectSave('订阅更新', false);
    triggerDataUpdate();
  }
};

const handleSubscriptionToggle = async (subscription: Subscription) => {
  subscription.enabled = !subscription.enabled;
  await handleDirectSave(`${subscription.name || '订阅'} 状态`);
};

const handleSubscriptionUpdate = async (subscriptionId: string) => {
  const sub = subscriptions.value.find(s => s.id === subscriptionId);
  if (!sub) return;

  if (await handleUpdateNodeCount(subscriptionId, false)) {
    showToast(`${sub.name || '订阅'} 已更新`, 'success');
    await handleDirectSave('订阅更新', false);
  } else {
    showToast(`${sub.name || '订阅'} 更新失败`, 'error');
  }
};

const handleDeleteSubscriptionWithCleanup = (subId: string) => {
  deletingItemId.value = subId;
  showDeleteSingleSubModal.value = true;
};

const handleConfirmDeleteSingleSub = async () => {
  if (!deletingItemId.value) return;
  deleteSubscription(deletingItemId.value);
  removeIdFromProfiles(deletingItemId.value, 'subscriptions');
  await handleDirectSave('订阅删除');
  triggerDataUpdate();
  showDeleteSingleSubModal.value = false;
};

const handleDeleteAllSubscriptionsWithCleanup = async () => {
  deleteAllSubscriptions();
  clearProfilesField('subscriptions');
  await handleDirectSave('订阅清空');
  triggerDataUpdate();
  showDeleteSubsModal.value = false;
};

const handleBatchDeleteSubs = async (subIds: string[]) => {
  if (!subIds || subIds.length === 0) return;
  subIds.forEach(id => {
    deleteSubscription(id);
    removeIdFromProfiles(id, 'subscriptions');
  });
  await handleDirectSave(`批量删除 ${subIds.length} 个订阅`);
  triggerDataUpdate();
};

const handleUpdateAllSubscriptions = async () => {
  if (isUpdatingAllSubs.value) return;
  const enabledSubs = subscriptions.value.filter(sub => sub.enabled && sub.url && HTTP_REGEX.test(sub.url));
  if (enabledSubs.length === 0) return showToast('没有可更新的订阅', 'warning');

  isUpdatingAllSubs.value = true;
  try {
    const result = await batchUpdateNodes(enabledSubs.map(sub => sub.id));
    
    // 兼容 data 和 results 字段，处理后端可能返回的不同结构
    const updateResults = Array.isArray(result.data) 
      ? result.data 
      : (Array.isArray((result as any).results) ? (result as any).results : null);

    if (result.success && updateResults) {
       const subsMap = new Map(subscriptions.value.map(s => [s.id, s]));
       updateResults.forEach((r: any) => {
         if (r.success) {
           const sub = subsMap.get(r.id);
           if (sub) {
             if (typeof r.nodeCount === 'number') sub.nodeCount = r.nodeCount;
             if (r.userInfo) sub.userInfo = r.userInfo;
           }
         }
       });
       const successCount = updateResults.filter((r: any) => r.success).length;
       showToast(`成功更新了 ${successCount} 个订阅`, 'success');
       await handleDirectSave('订阅更新', false);
    } else {
      showToast(`更新失败: ${result.message || '未知错误'}`, 'error');
    }
  } catch (error) {
    showToast('批量更新失败', 'error');
  } finally {
    isUpdatingAllSubs.value = false;
  }
};

// --- 节点操作 ---
const handleAddNode = () => {
  isNewNode.value = true;
  editingNode.value = createNode('');
  showNodeModal.value = true;
};

const handleEditNode = (nodeId: string) => {
  const node = manualNodes.value.find(n => n.id === nodeId);
  if (node) {
    isNewNode.value = false;
    editingNode.value = { ...node };
    showNodeModal.value = true;
  }
};

const handleNodeUrlInput = (event: Event) => {
  if (!editingNode.value) return;
  const target = event.target as HTMLTextAreaElement;
  const newUrl = target.value;
  if (newUrl && !editingNode.value.name) {
    editingNode.value.name = extractNodeName(newUrl);
  }
};

const handleSaveNode = async () => {
  if (!editingNode.value?.url) return showToast('节点链接不能为空', 'error');

  if (isNewNode.value) {
    addNode(editingNode.value);
  } else {
    updateNode(editingNode.value);
  }
  await handleDirectSave('节点');
  triggerDataUpdate();
  showNodeModal.value = false;
};

const handleDeleteNodeWithCleanup = (nodeId: string) => {
  deletingItemId.value = nodeId;
  showDeleteSingleNodeModal.value = true;
};

const handleConfirmDeleteSingleNode = async () => {
  if (!deletingItemId.value) return;
  deleteNode(deletingItemId.value);
  removeIdFromProfiles(deletingItemId.value, 'manualNodes');
  await handleDirectSave('节点删除');
  triggerDataUpdate();
  showDeleteSingleNodeModal.value = false;
};

const handleDeleteAllNodesWithCleanup = async () => {
  deleteAllNodes();
  clearProfilesField('manualNodes');
  await handleDirectSave('节点清空');
  triggerDataUpdate();
  showDeleteNodesModal.value = false;
};

const handleBatchDeleteNodes = async (nodeIds: string[]) => {
  if (!nodeIds || nodeIds.length === 0) return;
  nodeIds.forEach(id => {
    deleteNode(id);
    removeIdFromProfiles(id, 'manualNodes');
  });
  await handleDirectSave(`批量删除 ${nodeIds.length} 个节点`);
  triggerDataUpdate();
};

const handleDeduplicateNodes = async () => {
  deduplicateNodes();
  await handleDirectSave('节点去重');
  triggerDataUpdate();
};

const handleAutoSortNodes = async () => {
  autoSortNodes();
  await handleDirectSave('节点排序');
  triggerDataUpdate();
};

const handleBulkImport = async (importText: string) => {
  const { subs, nodes } = parseImportText(importText);
  
  if (subs.length > 0) addSubscriptionsFromBulk(subs);
  if (nodes.length > 0) addNodesFromBulk(nodes);

  await handleDirectSave('批量导入');
  emit('update-data', { subs: [...subscriptions.value, ...manualNodes.value] });
  showToast(`成功导入 ${subs.length} 条订阅和 ${nodes.length} 个手动节点`, 'success');
};

// --- 订阅组操作 ---
// Profile operations delegated to useProfiles, but we handle Modal interaction here
const handleAddProfile = () => {
   if (!config.value?.profileToken?.trim()) {
     showToast('请先在"设置"中配置"订阅组分享Token"', 'error');
     return;
   }
   isNewProfile.value = true;
   editingProfile.value = { 
     id: '', name: '', enabled: true, subscriptions: [], 
     manualNodes: [], customId: '', subConverter: '', subConfig: '', expiresAt: '' 
   };
   showProfileModal.value = true;
};

const handleEditProfile = (profileId: string) => {
  const profile = profiles.value.find(p => p.id === profileId);
  if (profile) {
    isNewProfile.value = false;
    editingProfile.value = JSON.parse(JSON.stringify(profile));
    if (editingProfile.value) editingProfile.value.expiresAt = profile.expiresAt || '';
    showProfileModal.value = true;
  }
};

const handleSaveProfile = async (profileData: Profile) => {
  if (!profileData?.name) return showToast('订阅组名称不能为空', 'error');

  const success = isNewProfile.value ? addProfile(profileData) : updateProfile(profileData);
  if (success) {
    await handleDirectSave('订阅组');
    emit('update-data', { profiles: [...profiles.value] });
    showProfileModal.value = false;
  }
};

const handleProfileToggle = async (updatedProfile: Profile) => {
   toggleProfile(updatedProfile.id, updatedProfile.enabled);
   await handleDirectSave(`${updatedProfile.name || '订阅组'} 状态`);
   emit('update-data', { profiles: [...profiles.value] });
};

const handleDeleteProfile = (profileId: string) => {
  deletingItemId.value = profileId;
  showDeleteSingleProfileModal.value = true;
};

const handleConfirmDeleteSingleProfile = async () => {
  if (!deletingItemId.value) return;
  deleteProfile(deletingItemId.value);
  await handleDirectSave('订阅组删除');
  emit('update-data', { profiles: [...profiles.value] });
  showDeleteSingleProfileModal.value = false;
};

const handleBatchDeleteProfiles = async (profileIds: string[]) => {
  batchDeleteProfiles(profileIds);
  await handleDirectSave(`批量删除 ${profileIds.length} 个订阅组`);
  emit('update-data', { profiles: [...profiles.value] });
};

const handleDeleteAllProfiles = async () => {
  deleteAllProfiles(); 
  await handleDirectSave('订阅组清空');
  emit('update-data', { profiles: [...profiles.value] });
  showDeleteProfilesModal.value = false;
};

// --- Modal Display Helpers ---
const handleShowNodeDetails = (subscription: Subscription) => {
  selectedSubscription.value = subscription;
  selectedProfile.value = null;
  showNodeDetailsModal.value = true;
};

const handleShowProfileNodeDetails = (profile: Profile) => {
  selectedProfile.value = profile;
  selectedSubscription.value = null;
  showNodeDetailsModal.value = true;
};
</script>

<template>
  <div v-if="isLoading" class="text-center py-16 text-gray-500">
    正在加载...
  </div>
  <div v-else class="w-full container-optimized">



    <!-- 主要内容区域 - 根据标签页显示不同内容 -->
    <div class="space-y-6 lg:space-y-8">

      <!-- 仪表盘标签页 -->
      <DashboardHome v-if="activeTab === 'dashboard'" :subscriptions="subscriptions"
        :active-subscriptions="activeSubscriptions" :total-node-count="totalNodeCount"
        :active-node-count="activeNodeCount" :profiles="profiles" :active-profiles="activeProfiles"
        :manual-nodes="manualNodes" :active-manual-nodes="activeManualNodes" :is-updating-all-subs="isUpdatingAllSubs"
        @add-subscription="handleAddSubscription" @update-all-subscriptions="handleUpdateAllSubscriptions"
        @add-node="handleAddNode" @add-profile="handleAddProfile" />

      <!-- 订阅管理标签页 -->
      <SubscriptionsTab v-if="activeTab === 'subscriptions'" v-model:subscriptions="subscriptions"
        :paginated-subscriptions="paginatedSubscriptions" :subs-current-page="subsCurrentPage"
        :subs-total-pages="subsTotalPages" :is-sorting-subs="isSortingSubs"
        :has-unsaved-sort-changes="hasUnsavedSortChanges" :is-updating-all-subs="isUpdatingAllSubs"
        @add-subscription="handleAddSubscription" @update-all-subscriptions="handleUpdateAllSubscriptions"
        @save-sort="handleSaveSortChanges" @toggle-sort="handleToggleSortSubs"
        @delete-all-subs="showDeleteSubsModal = true" @batch-delete-subs="handleBatchDeleteSubs"
        @drag-end="handleSubscriptionDragEnd" @delete-sub="handleDeleteSubscriptionWithCleanup"
        @toggle-sub="handleSubscriptionToggle" @update-sub="handleSubscriptionUpdate" @edit-sub="handleEditSubscription"
        @show-nodes="handleShowNodeDetails" @change-page="changeSubsPage" />

      <!-- 订阅组标签页 -->
      <ProfilesTab v-if="activeTab === 'profiles'" :profiles="profiles" :paginated-profiles="paginatedProfiles"
        :profiles-current-page="profilesCurrentPage" :profiles-total-pages="profilesTotalPages"
        :subscriptions="subscriptions" @add-profile="handleAddProfile"
        @delete-all-profiles="showDeleteProfilesModal = true" @batch-delete-profiles="handleBatchDeleteProfiles"
        @edit-profile="handleEditProfile" @delete-profile="handleDeleteProfile" @toggle-profile="handleProfileToggle"
        @copy-link="copyProfileLink" @show-nodes="handleShowProfileNodeDetails" @change-page="changeProfilesPage" />

      <!-- 链接生成标签页 -->
      <GeneratorTab v-if="activeTab === 'generator'" :config="config" :profiles="profiles" />

      <!-- 手动节点标签页 -->
      <NodesTab v-if="activeTab === 'nodes'" v-model:manual-nodes="manualNodes" v-model:search-term="searchTerm"
        :paginated-manual-nodes="paginatedManualNodes" :manual-nodes-current-page="manualNodesCurrentPage"
        :manual-nodes-total-pages="manualNodesTotalPages" :is-sorting-nodes="isSortingNodes"
        :has-unsaved-sort-changes="hasUnsavedSortChanges" @add-node="handleAddNode"
        @bulk-import="showBulkImportModal = true" @save-sort="handleSaveSortChanges"
        @toggle-sort="handleToggleSortNodes" @import-subs="showSubscriptionImportModal = true"
        @auto-sort="handleAutoSortNodes" @deduplicate="handleDeduplicateNodes"
        @delete-all-nodes="showDeleteNodesModal = true" @batch-delete-nodes="handleBatchDeleteNodes"
        @drag-end="handleNodeDragEnd" @edit-node="handleEditNode" @delete-node="handleDeleteNodeWithCleanup"
        @change-page="changeManualNodesPage" />
    </div>
  </div>

  <!-- 模态框组件 -->
  <BulkImportModal v-model:show="showBulkImportModal" @import="handleBulkImport" />
  <Modal v-model:show="showDeleteSubsModal" @confirm="handleDeleteAllSubscriptionsWithCleanup">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认清空订阅</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除所有**订阅**吗？此操作将标记为待保存，不会影响手动节点。</p>
    </template>
  </Modal>
  <Modal v-model:show="showDeleteNodesModal" @confirm="handleDeleteAllNodesWithCleanup">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认清空节点</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除所有**手动节点**吗？此操作将标记为待保存，不会影响订阅。</p>
    </template>
  </Modal>
  <Modal v-model:show="showDeleteProfilesModal" @confirm="handleDeleteAllProfiles">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认清空订阅组</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除所有**订阅组**吗？此操作不可逆。</p>
    </template>
  </Modal>

  <!-- 单个订阅删除确认模态框 -->
  <Modal v-model:show="showDeleteSingleSubModal" @confirm="handleConfirmDeleteSingleSub">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认删除订阅</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除此订阅吗？此操作将标记为待保存，不会影响手动节点。</p>
    </template>
  </Modal>

  <!-- 单个节点删除确认模态框 -->
  <Modal v-model:show="showDeleteSingleNodeModal" @confirm="handleConfirmDeleteSingleNode">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认删除节点</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除此手动节点吗？此操作将标记为待保存，不会影响订阅。</p>
    </template>
  </Modal>

  <!-- 单个订阅组删除确认模态框 -->
  <Modal v-model:show="showDeleteSingleProfileModal" @confirm="handleConfirmDeleteSingleProfile">
    <template #title>
      <h3 class="text-xl font-bold text-red-500">确认删除订阅组</h3>
    </template>
    <template #body>
      <p class="text-base text-gray-400">您确定要删除此订阅组吗？此操作不可逆。</p>
    </template>
  </Modal>

  <ProfileModal v-if="showProfileModal" v-model:show="showProfileModal" :profile="editingProfile" :is-new="isNewProfile"
    :all-subscriptions="subscriptions" :all-manual-nodes="manualNodes" @save="handleSaveProfile" size="2xl" />

  <Modal v-if="editingNode" v-model:show="showNodeModal" @confirm="handleSaveNode">
    <template #title>
      <h3 class="text-xl font-bold text-gray-800 dark:text-white">{{ isNewNode ? '新增手动节点' : '编辑手动节点' }}</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <div><label for="node-name"
            class="block text-base font-medium text-gray-700 dark:text-gray-300">节点名称</label><input type="text"
            id="node-name" v-model="editingNode.name" placeholder="（可选）不填将自动获取"
            class="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none text-base dark:text-white">
        </div>
        <div><label for="node-url"
            class="block text-base font-medium text-gray-700 dark:text-gray-300">节点链接</label><textarea id="node-url"
            v-model="editingNode.url" @input="handleNodeUrlInput" rows="4"
            class="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none text-base font-mono dark:text-white"></textarea>
        </div>
      </div>
    </template>
  </Modal>

  <Modal v-if="editingSubscription" v-model:show="showSubModal" @confirm="handleSaveSubscription" size="2xl">
    <template #title>
      <h3 class="text-xl font-bold text-gray-800 dark:text-white">{{ isNewSubscription ? '新增订阅' : '编辑订阅' }}</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <div><label for="sub-edit-name"
            class="block text-base font-medium text-gray-700 dark:text-gray-300">订阅名称</label><input type="text"
            id="sub-edit-name" v-model="editingSubscription.name" placeholder="（可选）不填将自动获取"
            class="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none text-base dark:text-white">
        </div>
        <div><label for="sub-edit-url"
            class="block text-base font-medium text-gray-700 dark:text-gray-300">订阅链接</label><input type="text"
            id="sub-edit-url" v-model="editingSubscription.url" placeholder="https://..."
            class="mt-1 block w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none text-base font-mono dark:text-white"></input>
        </div>
        <div>
          <label class="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">节点过滤规则</label>
          <NodeFilterEditor v-model="editingSubscription.exclude" />
        </div>
      </div>
    </template>
  </Modal>

  <SettingsModal v-model:show="uiStore.isSettingsModalVisible" />
  <SubscriptionImportModal :show="showSubscriptionImportModal" @update:show="showSubscriptionImportModal = $event"
    :add-nodes-from-bulk="addNodesFromBulk"
    :on-import-success="async () => { await handleDirectSave('导入订阅'); triggerDataUpdate(); }" />
  <NodeDetailsModal :show="showNodeDetailsModal" @update:show="showNodeDetailsModal = $event"
    :subscription="selectedSubscription" :profile="selectedProfile" :all-subscriptions="subscriptions"
    :all-manual-nodes="manualNodes" />
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}

.cursor-move {
  cursor: move;
}

.slide-fade-sm-enter-active,
.slide-fade-sm-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-sm-enter-from,
.slide-fade-sm-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* 移动端响应式优化 */
@media (max-width: 1024px) {


  .container-optimized {
    width: 100% !important;
  }
}

/* 小屏手机优化 (≤640px) */
@media (max-width: 640px) {

  /* 按钮文字在小屏幕上可见 */
  .btn-modern-enhanced {
    font-size: 0.8125rem !important;
    padding: 0.5rem 0.75rem !important;
  }

  /* 搜索框和操作按钮响应式布局 */
  .flex.flex-wrap.items-center.gap-3 {
    gap: 0.5rem !important;
  }
}
</style>
