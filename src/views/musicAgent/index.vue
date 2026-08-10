<template>
  <div class="musicAgent">
    <Splitpanes class="default-theme data f">
      <Pane :size="30" :min-size="15" class="operate">
        <div class="box pr">
          <div class="audioBar" v-if="project?.projectType === 'music_mv'">
            <t-button v-if="!audioUploaded" theme="primary" variant="outline" size="small" @click="triggerAudioUpload">
              <template #icon><i-upload size="14" /></template>
              上传歌曲音频
            </t-button>
            <div v-else class="audioInfo">
              <i-music size="14" />
              <span class="audioName" :title="audioName">{{ audioName }}</span>
            </div>
            <input ref="audioInputRef" type="file" accept="audio/*" style="display: none" @change="handleAudioFileChange" />
            <span class="audioBarDivider"></span>
            <t-button v-if="!vocalUploaded" variant="outline" size="small" @click="triggerVocalUpload">
              <template #icon><i-upload size="14" /></template>
              纯人声（可选）
            </t-button>
            <div v-else class="audioInfo">
              <i-music size="14" />
              <span class="audioName" :title="vocalName">{{ vocalName }}</span>
            </div>
            <input ref="vocalInputRef" type="file" accept="audio/*" style="display: none" @change="handleVocalFileChange" />
            <t-tooltip content="纯人声版用于口型驱动（可选）。如果想口型同步更准，建议上传与原曲时长一致的纯人声版；不上传则用原曲做口型参考。">
              <span class="vocalTip">?</span>
            </t-tooltip>
          </div>
          <t-chat-list :clear-history="false">
            <t-chat-message
              v-for="message in messages"
              :key="message.id"
              :message="message"
              :name="(message as any).name"
              :placement="message.role === 'user' ? 'right' : 'left'"
              :variant="message.role === 'user' ? 'base' : 'outline'"
              :handleActions="message.role === 'user' ? {} : handleActions"
              :status="message.status"
              allowContentSegmentCustom></t-chat-message>
          </t-chat-list>
          <t-chat-sender
            class="inputBox"
            :disabled="status === 'pending' || status === 'streaming'"
            v-model="inputValue"
            :loading="status === 'pending' || status === 'streaming'"
            placeholder="请输入指令，例如：开始制作音乐MV"
            @send="handleSend"
            @stop="handleStop">
            <template #footer-prefix>
              <t-popup trigger="click" placement="top-left">
                <t-button shape="square" variant="outline" size="small" :disabled="status === 'pending' || status === 'streaming'">
                  <template #icon>
                    <i-setting-config size="16" />
                  </template>
                </t-button>
                <template #content>
                  <div class="settingMenu">
                    <div class="settingMenuItem" @click="handleReconnect()">
                      <i-api size="14" />
                      <span>重新连接</span>
                    </div>
                    <div class="settingMenuItem" @click="handleClearMemory('message')">
                      <i-delete size="14" />
                      <span>清除消息记忆</span>
                    </div>
                    <div class="settingMenuItem" @click="handleClearMemory('summary')">
                      <i-close size="14" />
                      <span>清除摘要记忆</span>
                    </div>
                    <div class="settingMenuItem danger" @click="handleClearMemory('all')">
                      <i-delete-one size="14" />
                      <span>清除全部记忆</span>
                    </div>
                  </div>
                </template>
              </t-popup>
              <t-popup trigger="click" placement="top">
                <t-button
                  size="small"
                  variant="outline"
                  :theme="(['default', 'success', 'warning', 'danger'] as const)[thinkLevel] || 'default'"
                  style="margin-left: 8px">
                  <template #icon>
                    <i-tips size="16" />
                  </template>
                  {{ thinkLevelOptions[thinkLevel]?.label }}
                </t-button>
                <template #content>
                  <div class="settingMenu">
                    <div
                      v-for="opt in thinkLevelOptions"
                      :key="opt.value"
                      class="settingMenuItem"
                      :class="{ active: thinkLevel === opt.value }"
                      @click="musicAgentStore().updateThinkConfig(opt.value)">
                      <span>{{ opt.label }}</span>
                    </div>
                  </div>
                </template>
              </t-popup>
            </template>
          </t-chat-sender>
          <i-dot class="dot" theme="outline" :fill="connected ? 'green' : 'red'" />
        </div>
      </Pane>
      <Pane :size="70" :min-size="30" class="data">
        <div class="tabsWrapper">
          <div v-if="flowData.mvStyle || flowData.mvRange" class="styleBadge">
            <i-tag v-if="flowData.mvStyle" size="small" theme="primary">MV风格：{{ mvStyleLabel(flowData.mvStyle) }}</i-tag>
            <i-tag v-if="flowData.mvRange" size="small" :theme="flowData.mvRange.mode === 'segment' ? 'warning' : 'success'">
              制作范围：{{ mvRangeLabel(flowData.mvRange) }}
            </i-tag>
          </div>
          <t-tabs v-model="currentTable">
            <t-tab-panel :value="1" :label="`音乐时间线 (${lyrics.length})`">
              <div class="panelContent">
                <t-empty v-if="!lyrics.length" :title="'暂无歌词，请先让音乐Agent转录'" />
                <div v-else>
                  <div v-if="flowData.lyricsAlignedBy === 'forced_aligner'" class="alignBadge">
                    <i-tag size="small" theme="success">已用 Qwen3-ForcedAligner 精确对齐（毫秒级）</i-tag>
                  </div>
                  <div class="lyricsList">
                    <div v-for="(item, index) in lyrics" :key="item.id || index" class="lyricRow" :class="{ dimmed: isDimmed(item) }">
                      <div class="lyricTime">{{ formatTime(item.startTime) }} - {{ formatTime(item.endTime) }}</div>
                      <div class="lyricText">{{ item.text }}</div>
                      <div class="lyricSection">
                        <t-tag v-if="item.segmentType" size="small" :theme="segmentTypeTheme(item.segmentType)">{{ segmentTypeLabel(item.segmentType) }}</t-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </t-tab-panel>
            <t-tab-panel :value="2" :label="'剧本'">
              <div class="panelContent">
                <div v-if="timeline" class="timelineInfo">
                  <t-tag theme="primary" size="small" class="timelineTag">按歌词时间轴分组成 {{ timeline.groups }} 组</t-tag>
                  <t-tag v-if="timeline.mvRange?.mode === 'segment'" :theme="timeline.aligned ? 'success' : 'warning'" size="small" class="timelineTag">
                    制作范围 {{ formatDur(timeline.mvRange.startTime) }}-{{ formatDur(timeline.mvRange.endTime) }} · 片段总时长 {{ formatDur(timeline.totalSpan) }}
                  </t-tag>
                  <t-tag v-else :theme="timeline.aligned ? 'success' : 'warning'" size="small" class="timelineTag">
                    分组总时长 {{ formatDur(timeline.totalSpan) }} {{ timeline.aligned ? "=" : "≠" }} 音频总时长 {{ formatDur(timeline.audioDuration) }}
                  </t-tag>
                  <span v-if="timeline.scriptId" class="timelineHint">已按分组对齐剧本，可进入生产页导演规划（每组=一条视频）</span>
                </div>
                <div v-if="flowData.script" class="scriptContent">{{ flowData.script }}</div>
                <t-empty v-else :title="'暂无剧本，完成歌词转录和MV场景风格设计后自动生成'" />
              </div>
            </t-tab-panel>
          </t-tabs>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>

<script setup lang="ts">
import { Splitpanes, Pane } from "splitpanes";
import axios from "@/utils/axios";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
import musicAgentStore from "@/stores/musicAgent";
const { connected, messages, status, flowData, thinkLevel } = storeToRefs(musicAgentStore());

const thinkLevelOptions = [
  { label: "关闭思考", value: 0 },
  { label: "轻度思考", value: 1 },
  { label: "深度思考", value: 2 },
  { label: "极致思考", value: 3 },
];

const currentTable = ref(1);
const inputValue = ref("");

const defMsg: ChatMessagesData[] = [
  {
    id: "welcome",
    role: "assistant",
    content: [
      {
        type: "text",
        status: "complete",
        data: "你好，我是音乐MV制作助手。我可以帮你完成：歌词转录 → MV导演风格 → 剧本。\n\n开始前请先上传歌曲音频，然后告诉我「开始制作」即可。转录完成后如需歌词，直接把歌词粘贴到对话中，我会按音频时间轴自动对齐。",
      },
      {
        type: "suggestion",
        status: "complete",
        data: [{ title: "开始制作音乐MV", prompt: "开始制作音乐MV" }],
      },
    ],
  },
];

onMounted(() => {
  if (messages.value.length <= 0) messages.value = [...defMsg, ...messages.value];
  getLyrics();
  getFlowData();
  getAudioStatus();
  musicAgentStore().connect();
});

// AI 完成后刷新歌词，并从后端重新加载剧本和设计（子Agent/工具已直接保存到后端）
watch(status, (newStatus) => {
  if (newStatus === "complete" || newStatus === "idle") {
    getLyrics();
    // 剧本和MV场景风格设计由子Agent/工具在服务端保存，完成后重新拉取显示（始终用最新）
    axios.post("/musicAgent/getMusicFlowData", { projectId: project.value?.id }).then(({ data }) => {
      if (data?.script) flowData.value.script = data.script;
      if (data?.mvDesign) flowData.value.mvDesign = data.mvDesign;
      if (data?.mvRange) flowData.value.mvRange = data.mvRange;
      // 剧本生成完成后，自动按歌词时间轴构建分组并展示核对信息
      if (data?.script) buildMvTimeline();
    }).catch(() => {});
  }
});

// ---- 时间线分组（buildTimeline）----
const timeline = ref<{ groups: number; totalSpan: number; audioDuration: number; aligned: boolean; scriptId: number | null; mvRange: any } | null>(null);

async function buildMvTimeline() {
  if (!project.value?.id || !flowData.value.script) return;
  try {
    const { data } = await axios.post("/musicAgent/buildTimeline", { projectId: project.value.id });
    if (data?.groups) {
      timeline.value = {
        groups: data.groups.length,
        totalSpan: data.totalSpan,
        audioDuration: data.audioDuration,
        aligned: data.aligned,
        scriptId: data.scriptId ?? null,
        mvRange: data.mvRange ?? null,
      };
    }
    // 展示对齐分组后的剧本（后端已存 mvTimelineScript）
    const flowRes = await axios.post("/musicAgent/getMusicFlowData", { projectId: project.value.id });
    if (flowRes?.data?.mvTimelineScript) flowData.value.script = flowRes.data.mvTimelineScript;
  } catch {}
}

function formatDur(sec: number) {
  if (sec === null || sec === undefined || !isFinite(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const handleActions = {
  suggestion: (data?: any) => {
    musicAgentStore().chat(data?.content?.prompt);
  },
};

function handleSend(text: string) {
  // 歌词直接在对话中粘贴给 AI，由 AI 按音频时间轴对齐
  musicAgentStore().chat(text);
  inputValue.value = "";
}
function handleStop() {
  musicAgentStore().stopGenerate();
}

// ---- 记忆管理 ----
const memoryTypeLabel: Record<string, string> = {
  message: "消息记忆",
  summary: "摘要记忆",
  all: "全部记忆",
};
function handleClearMemory(type: "message" | "summary" | "all") {
  const dialog = DialogPlugin.confirm({
    header: "确认清除",
    body: `确定清除${memoryTypeLabel[type]}吗？`,
    confirmBtn: "确定清除",
    cancelBtn: "取消",
    theme: "warning",
    onConfirm: async () => {
      await axios.post(`/agents/clearMemory`, { projectId: project.value?.id, agentType: "musicAgent", type });
      window.$message.success(`已清除${memoryTypeLabel[type]}`);
      dialog.destroy();
      getHistory();
    },
  });
}
function handleReconnect() {
  musicAgentStore().connect();
}

const loadingHistory = ref(false);
async function getHistory() {
  loadingHistory.value = true;
  const { data } = await axios.post(`/agents/getMemory`, {
    projectId: project.value?.id,
    agentType: "musicAgent",
  });
  messages.value = [...defMsg, ...data];
  loadingHistory.value = false;
}

// ---- 音频上传 ----
const audioInputRef = ref<HTMLInputElement>();
const audioUploaded = ref(false);
const audioName = ref("");
const uploading = ref(false);

function triggerAudioUpload() {
  audioInputRef.value?.click();
}

async function handleAudioFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (file.size > 50 * 1024 * 1024) {
    window.$message.warning("音频文件过大，请上传50MB以内的文件");
    return;
  }
  uploading.value = true;
  try {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const { data } = await axios.post("/musicAgent/uploadAudio", {
      projectId: project.value?.id,
      fileName: file.name,
      base64,
    });
    audioUploaded.value = true;
    audioName.value = file.name;
    window.$message.success("音频上传成功");
  } catch (err: any) {
    window.$message.error(err?.message ?? "音频上传失败");
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

// ---- 纯人声上传（可选，口型参考）----
const vocalInputRef = ref<HTMLInputElement>();
const vocalUploaded = ref(false);
const vocalName = ref("");

function triggerVocalUpload() {
  vocalInputRef.value?.click();
}

async function handleVocalFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (file.size > 50 * 1024 * 1024) {
    window.$message.warning("音频文件过大，请上传50MB以内的文件");
    return;
  }
  uploading.value = true;
  try {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await axios.post("/musicAgent/uploadAudio", {
      projectId: project.value?.id,
      fileName: file.name,
      base64,
      type: "vocal",
    });
    vocalUploaded.value = true;
    vocalName.value = file.name;
    window.$message.success("纯人声上传成功");
  } catch (err: any) {
    window.$message.error(err?.message ?? "纯人声上传失败");
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = "";
  }
}

async function getAudioStatus() {
  if (!project.value?.id) return;
  const projectData = await axios.post("/project/getProject");
  const cur = projectData.data.find((p: any) => p.id === project.value?.id);
  if (cur?.musicFilePath) {
    audioUploaded.value = true;
    audioName.value = cur.musicFilePath.split("/").pop() || "音频文件";
  }
  if (cur?.vocalFilePath) {
    vocalUploaded.value = true;
    vocalName.value = cur.vocalFilePath.split("/").pop() || "纯人声";
  }
}

// ---- 歌词数据 ----
const lyrics = ref<Array<{ id: number; text: string; startTime: number; endTime: number; segmentType: string }>>([]);

async function getLyrics() {
  if (!project.value?.id) return;
  const { data } = await axios.post("/musicAgent/getLyrics", { projectId: project.value?.id });
  lyrics.value = data || [];
}

async function getFlowData() {
  if (!project.value?.id) return;
  const { data } = await axios.post("/musicAgent/getMusicFlowData", { projectId: project.value?.id });
  if (data) {
    flowData.value.lyricSceneMap = data.lyricSceneMap || "";
    flowData.value.mvStyle = data.mvStyle || "";
    flowData.value.script = data.script || "";
    flowData.value.mvDesign = data.mvDesign || null;
    flowData.value.lyricsAlignedBy = data.lyricsAlignedBy || "";
    flowData.value.mvRange = data.mvRange || null;
    if (data.script) buildMvTimeline();
  }
}

function formatTime(sec: number) {
  if (sec === null || sec === undefined) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---- 生成MV剧本 ----
function segmentTypeLabel(type: string) {
  const map: Record<string, string> = {
    lip_sync: "对口型",
    narrative: "叙事",
    atmosphere: "氛围",
    crowd: "观众",
    dance: "舞蹈参考",
    intro: "前奏",
    interlude: "间奏",
    outro: "尾奏",
  };
  return map[type] || type;
}

function segmentTypeTheme(type: string) {
  const map: Record<string, any> = {
    lip_sync: "warning",
    narrative: "primary",
    atmosphere: "default",
    crowd: "success",
    dance: "danger",
    intro: "default",
    interlude: "default",
    outro: "default",
  };
  return map[type] || "default";
}

// MV风格中文名
const MV_STYLE_NAMES: Record<string, string> = {
  concert: "演唱会现场版",
  story: "剧情叙事版",
  xianxia: "仙侠实景版",
  art: "视觉艺术版",
  onetake: "一镜到底版",
  dance: "舞蹈版",
  street: "街头潮流版",
  bwfilm: "黑白电影版",
  scifi: "CGI科幻版",
  minimal: "极简抒情版",
  shortfilm: "微电影版",
  travel: "实景旅行版",
  comedy: "搞笑整活版",
};
function mvStyleLabel(style: string) {
  return MV_STYLE_NAMES[style] || style;
}

// 制作范围中文名
function mvRangeLabel(range: any) {
  if (range?.mode === "segment" && Number.isFinite(range.startTime) && Number.isFinite(range.endTime)) {
    return `${formatTime(range.startTime)}-${formatTime(range.endTime)} 片段`;
  }
  return "整首歌";
}

// 选段模式下，选段外的歌词行置灰
function isDimmed(item: { startTime: number; endTime: number }) {
  const r = flowData.value.mvRange;
  if (r?.mode !== "segment" || !Number.isFinite(r.startTime) || !Number.isFinite(r.endTime)) return false;
  return !(item.endTime > r.startTime && item.startTime < r.endTime);
}
</script>

<style lang="scss" scoped>
.musicAgent {
  height: 100%;
  .audioBar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--td-border-level-1-color);
    .audioInfo {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--td-text-color-primary);
      .audioName {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
    .audioBarDivider {
      width: 1px;
      height: 16px;
      background: var(--td-text-color-placeholder);
      flex-shrink: 0;
    }
    .vocalTip {
      width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      border-radius: 50%;
      border: 1px solid var(--td-brand-color);
      color: var(--td-brand-color);
      font-size: 12px;
      cursor: help;
      flex-shrink: 0;
    }
    .genBtn {
      margin-left: auto;
      flex-shrink: 0;
    }
  }
  .box {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .tabsWrapper {
    height: 100%;
    position: relative;
    .styleBadge {
      position: absolute;
      top: 8px;
      right: 16px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .alignBadge {
      margin-bottom: 8px;
    }
    :deep(.t-tabs) {
      height: 100%;
      display: flex;
      flex-direction: column;
      .t-tabs__content {
        flex: 1;
        min-height: 0;
        .t-tab-panel {
          height: 100%;
        }
      }
    }
    .panelContent {
      height: 100%;
      overflow-y: auto;
      padding: 16px;
    }
  }
  .lyricsList {
    display: flex;
    flex-direction: column;
    gap: 8px;
    .lyricRow {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      background: var(--td-bg-color-container);
      &.dimmed {
        opacity: 0.4;
      }
      .lyricTime {
        flex-shrink: 0;
        font-size: 12px;
        color: var(--td-brand-color);
        font-family: monospace;
      }
      .lyricText {
        flex: 1;
        font-size: 14px;
        color: var(--td-text-color-primary);
      }
      .lyricSection {
        flex-shrink: 0;
      }
    }
  }
  .scriptContent {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
    font-size: 13px;
    color: var(--td-text-color-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .timelineInfo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 12px;
    border-radius: 6px;
    background: var(--td-bg-color-container-hover);
    .timelineTag {
      margin-right: 0;
    }
    .timelineHint {
      font-size: 12px;
      color: var(--td-text-color-placeholder);
    }
  }
  :deep(.t-chat-list) {
    flex: 1;
    min-height: 0;
  }
  .inputBox {
    flex-shrink: 0;
  }
}
</style>
