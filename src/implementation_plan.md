# 前端优化与架构拆分实施计划

## 1. 架构调整目标 (Architecture Re-design)
为了响应“拆分，便于维护”的要求，我们将把 `DashboardView.vue` 从一个由逻辑驱动的巨型组件，转变为一个纯粹的**视图层协调者 (View Coordinator)**。它将负责组装不同的逻辑模块，而不是实现它们。

**拆分原则：**
*   **业务逻辑下沉**：所有数据操作（增加、删除、更新、排序、去重、计算属性）移入 `composables`。
*   **持久化层独立**：保存、加载、脏数据检测移入 `useAppPersistence.ts`。
*   **UI 状态保留**：模态框的 `show/hide` 状态保留在组件层，但其触发的动作（Action）调用 Composable 方法。

## 2. 新增模块分解 (New Modules)

### 2.1 `src/composables/useProfiles.ts`
负责所有订阅组相关的逻辑。
*   **State**: `profiles`, `paginatedProfiles`, `currentPage`, `totalPages`
*   **Actions**: `addProfile`, `updateProfile`, `deleteProfile`, `toggleProfile`, `batchDeleteProfiles`
*   **Helpers**: `copyProfileLink` (需要传入 config)

### 2.2 `src/composables/useAppPersistence.ts`
负责全局数据状态和持久化。
*   **State**: `isLoading`, `dirty`, `saveState`
*   **Actions**: `initializeState`, `handleSave`, `handleDiscard`
*   **Hooks**: `onMounted` (init), `onUnmounted` (cleanup), `beforeunload` 监听
*   **Dependencies**: 需要访问 `subscriptions`, `manualNodes`, `profiles`, `config` 的引用以便保存它们的状态。

### 2.3 `src/lib/importer.ts` (New Utility)
将 `handleBulkImport` 中的复杂文本解析逻辑提取为纯函数。
*   `function parseImportText(text: string): { subs: Subscription[], nodes: Node[] }`
*   包含 `HTTP_REGEX`, `NODE_PROTOCOL_REGEX` 等常量。
*   包含 `extractNodeName` 的调用和默认值处理。

## 3. 现有模块优化 (Optimization of Existing Modules)

### 3.1 `src/composables/useSubscriptions.ts`
*   移除 `any` 类型，使用 `Subscription` 接口。
*   确保 `addSubscription` 等方法返回 Promise 或状态，以便 UI 层处理后续交互（如重新获取节点数）。

### 3.2 `src/composables/useManualNodes.ts`
*   移除 `any` 类型，使用 `Node` 接口。
*   确保 `deduplicateNodes` 等功能的独立性。

## 4. `DashboardView.vue` 重构步骤 (Refactoring Steps)

1.  **创建文件**：新建上述 2.1, 2.2, 2.3 的文件。
2.  **迁移逻辑**：
    *   将 `DashboardView.vue` 中的 Profiles 逻辑剪切到 `useProfiles.ts`。
    *   将 Save/Load 逻辑剪切到 `useAppPersistence.ts`。
    *   将 Import 逻辑替换为调用 `importer.ts`。
3.  **组件清理**：
    *   删除已迁移的 ref 和 method。
    *   引入新的 composables。
    *   修复模板中对变量引用的断裂（例如 `profiles` 现在可能来自 `const { profiles } = useProfiles(...)`）。
4.  **类型修复**：全量检查 TS 错误。

## 5. 预期目录结构 (Expected Directory Structure)
```
src/
  components/views/DashboardView.vue (大幅瘦身)
  composables/
    useSubscriptions.ts (现有)
    useManualNodes.ts (现有)
    useProfiles.ts (新增)
    useAppPersistence.ts (新增)
  lib/
    importer.ts (新增)
    api.ts
    utils.ts
```

## 6. 执行顺序
1.  创建 `src/lib/importer.ts`
2.  创建 `src/composables/useProfiles.ts`
3.  创建 `src/composables/useAppPersistence.ts`
4.  重构 `src/components/views/DashboardView.vue`

是否确认执行此拆分计划？
