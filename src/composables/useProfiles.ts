import { ref, computed, type Ref } from 'vue';
import type { Profile, AppConfig } from '../types';
import { useToastStore } from '../stores/toast';

export function useProfiles(config: Ref<AppConfig>) {
    const { showToast } = useToastStore();
    const profiles = ref<Profile[]>([]);
    const profilesCurrentPage = ref(1);
    const profilesPerPage = 6;

    // Pagination
    const profilesTotalPages = computed(() => Math.ceil(profiles.value.length / profilesPerPage));

    const paginatedProfiles = computed(() => {
        const start = (profilesCurrentPage.value - 1) * profilesPerPage;
        const end = start + profilesPerPage;
        return profiles.value.slice(start, end);
    });

    const activeProfiles = computed(() => profiles.value.filter(profile => profile.enabled).length);

    // Methods
    function changeProfilesPage(page: number) {
        if (page < 1 || page > profilesTotalPages.value) return;
        profilesCurrentPage.value = page;
    }

    function initializeProfiles(profilesData: any[]) {
        profiles.value = (profilesData || []).map(p => ({
            ...p,
            id: p.id || crypto.randomUUID(),
            enabled: p.enabled ?? true,
            subscriptions: p.subscriptions || [],
            manualNodes: p.manualNodes || [],
            customId: p.customId || ''
        }));
    }

    function addProfile(profile: Profile) {
        // 检查 profileToken 是否已配置
        const token = config.value?.profileToken;
        if (!token || !token.trim()) {
            showToast('请先在"设置"中配置"订阅组分享Token"，否则无法创建订阅组', 'error');
            return false;
        }

        // 验证 customId
        if (profile.customId) {
            const CUSTOM_ID_REGEX = /[^a-zA-Z0-9-_]/g;
            profile.customId = profile.customId.replace(CUSTOM_ID_REGEX, '');
            if (profile.customId && profiles.value.some(p => p.id !== profile.id && p.customId === profile.customId)) {
                showToast(`自定义 ID "${profile.customId}" 已存在`, 'error');
                return false;
            }
        }

        profiles.value.unshift({ ...profile, id: crypto.randomUUID() });

        // 如果当前页面已满，跳转到第一页
        // Since paginatedProfiles is computed, we check logic:
        // If we add to front, we want to see it. Page 1 shows the front.
        profilesCurrentPage.value = 1;
        return true;
    }

    function updateProfile(updatedProfile: Profile) {
        if (updatedProfile.customId) {
            const CUSTOM_ID_REGEX = /[^a-zA-Z0-9-_]/g;
            updatedProfile.customId = updatedProfile.customId.replace(CUSTOM_ID_REGEX, '');
            if (updatedProfile.customId && profiles.value.some(p => p.id !== updatedProfile.id && p.customId === updatedProfile.customId)) {
                showToast(`自定义 ID "${updatedProfile.customId}" 已存在`, 'error');
                return false;
            }
        }

        const index = profiles.value.findIndex(p => p.id === updatedProfile.id);
        if (index !== -1) {
            profiles.value[index] = updatedProfile;
            return true;
        }
        return false;
    }

    function toggleProfile(profileId: string, enabled: boolean) {
        const index = profiles.value.findIndex(p => p.id === profileId);
        if (index !== -1) {
            profiles.value[index].enabled = enabled;
        }
    }

    function deleteProfile(profileId: string) {
        profiles.value = profiles.value.filter(p => p.id !== profileId);
        if (paginatedProfiles.value.length === 0 && profilesCurrentPage.value > 1) {
            profilesCurrentPage.value--;
        }
    }

    function deleteAllProfiles() {
        profiles.value = [];
        profilesCurrentPage.value = 1;
    }

    function batchDeleteProfiles(profileIds: string[]) {
        if (!profileIds || profileIds.length === 0) return;
        profiles.value = profiles.value.filter(p => !profileIds.includes(p.id));
        if (paginatedProfiles.value.length === 0 && profilesCurrentPage.value > 1) {
            profilesCurrentPage.value--;
        }
    }

    function copyProfileLink(profileId: string) {
        const token = config.value?.profileToken;
        if (!token || token === 'auto' || !token.trim()) {
            showToast('请在设置中配置一个固定的“订阅组分享Token”', 'error');
            return;
        }
        const profile = profiles.value.find(p => p.id === profileId);
        if (!profile) return;
        const identifier = profile.customId || profile.id;
        const link = `${window.location.origin}/${token}/${identifier}`;
        navigator.clipboard.writeText(link);
        showToast('订阅组分享链接已复制！', 'success');
    }

    function removeIdFromProfiles(id: string, field: 'subscriptions' | 'manualNodes') {
        profiles.value.forEach(p => {
            const index = p[field].indexOf(id);
            if (index !== -1) {
                p[field].splice(index, 1);
            }
        });
    }

    function clearProfilesField(field: 'subscriptions' | 'manualNodes') {
        profiles.value.forEach(p => {
            p[field].length = 0;
        });
    }

    return {
        profiles,
        profilesCurrentPage,
        profilesTotalPages,
        paginatedProfiles,
        activeProfiles,
        changeProfilesPage,
        initializeProfiles,
        addProfile,
        updateProfile,
        deleteProfile,
        toggleProfile,
        deleteAllProfiles,
        batchDeleteProfiles,
        copyProfileLink,
        removeIdFromProfiles,
        clearProfilesField
    };
}
