# 前端深化优化实施计划 (Phase 2)

## 1. 目标 (Objectives)
在完成了架构拆分的基础上，进一步提升代码的整洁度、类型安全性和可维护性。重点关注常量管理、API 层类型定义。

## 2. 任务分解 (Task Decomposition)

### 2.1 静态资源提取 (Extract Static Assets)
*   **目标文件**: `src/lib/constants.ts` (新建)
*   **内容**:
    *   将 `useManualNodes.ts` 中的 `countryCodeMap` (旗帜映射) 移出。
    *   将 `useManualNodes.ts` 中的 `regionKeywords` (正则匹配规则) 移出。
    *   将 `useAppPersistence.ts` 和其他文件中的 `HTTP_REGEX` 等正则常量统一管理。

### 2.2 API 层类型强化 (API Layer Typing)
*   **目标文件**: `src/lib/api.ts`
*   **内容**:
    *   移除 `any` 类型。
    *   为 API 的入参 (`saveSubs`, `saveSettings`) 和出参定义明确的 Interface。
    *   统一错误处理返回格式。

### 2.3 Composable 清理 (Composable Cleanup)
*   **目标文件**: `src/composables/useManualNodes.ts`
*   **内容**:
    *   引入 `constants.ts`，移除内部大段的静态数据。
    *   检查是否有冗余的 `any` 类型。

## 3. 执行顺序
1.  创建 `src/lib/constants.ts`。
2.  重构 `src/composables/useManualNodes.ts` 使用新常量。
3.  重构 `src/lib/api.ts` 增加类型定义。

是否确认执行此深化优化？
