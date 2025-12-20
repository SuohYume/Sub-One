import { ref, type Ref, onMounted, onUnmounted, watch } from 'vue';
import { saveSubs } from '../lib/api';
import { useToastStore } from '../stores/toast';
import type { Subscription, Node, Profile, AppConfig } from '../types';

export function useAppPersistence(
    subscriptions: Ref<Subscription[]>,
    manualNodes: Ref<Node[]>,
    profiles: Ref<Profile[]>,
    config: Ref<AppConfig>
) {
    const { showToast } = useToastStore();

    // The dirty flag indicates if there are unsaved changes.
    const dirty = ref(false);
    const saveState = ref<'idle' | 'saving' | 'success'>('idle');

    // Watch for deep changes in the data that needs to be persisted
    watch([subscriptions, manualNodes, profiles, config], () => {
        dirty.value = true;
    }, { deep: true });

    // Reset dirty flag when saveState becomes 'success'
    watch(saveState, (newState) => {
        if (newState === 'success') {
            dirty.value = false; // Immediately reset dirty
            setTimeout(() => {
                saveState.value = 'idle';
            }, 1500);
        }
    });

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (dirty.value) {
            event.preventDefault();
            event.returnValue = '您有未保存的更改，確定要离开嗎？';
        }
    };

    onMounted(() => {
        window.addEventListener('beforeunload', handleBeforeUnload);
    });

    onUnmounted(() => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
    });

    /**
     * Main save function
     */
    async function handleSave() {
        saveState.value = 'saving';

        // Prepare data
        // Remove temporary fields like 'isUpdating'
        const combinedSubs = [
            ...subscriptions.value.map(sub => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { isUpdating, ...rest } = sub;
                return rest;
            }),
            ...manualNodes.value.map(node => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { isUpdating, ...rest } = node;
                return rest;
            })
        ];

        try {
            // Validate
            if (!Array.isArray(combinedSubs) || !Array.isArray(profiles.value)) {
                throw new Error('数据格式错误，请刷新页面后重试');
            }

            const result = await saveSubs(combinedSubs, profiles.value);

            if (result.success) {
                saveState.value = 'success';
                return true;
            } else {
                const errorMessage = result.message || result.error || '保存失败，请稍后重试';
                throw new Error(errorMessage);
            }
        } catch (error: any) {
            console.error('保存数据时发生错误:', error);

            const errorMessageMap = new Map([
                ['网络', '网络连接异常，请检查网络连接'],
                ['格式', '数据格式异常，请刷新页面后重试'],
                ['存储', '存储服务暂时不可用，请稍后重试']
            ]);

            let userMessage = error.message;
            for (const [key, message] of errorMessageMap) {
                if (error.message.includes(key)) {
                    userMessage = message;
                    break;
                }
            }

            showToast(userMessage, 'error');
            saveState.value = 'idle';
            return false;
        }
    }

    /**
     * Helper for operations that should auto-save
     */
    async function handleDirectSave(operationName = '操作', showNotification = true) {
        try {
            const success = await handleSave();
            if (success && showNotification) {
                showToast(`${operationName}已保存`, 'success');
            }
            return success;
        } catch (error) {
            console.error('Direct save failed:', error);
            return false;
        }
    }

    return {
        dirty,
        saveState,
        handleSave,
        handleDirectSave
    };
}
