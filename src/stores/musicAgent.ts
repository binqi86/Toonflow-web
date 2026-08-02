import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";

interface MusicFlowData {
  audioFile: string;
  songName: string;
  lyrics: string;
  lyricSceneMap: string;
  mvStyle: string;
  script: string;
  mvDesign: any;
}

function makeMusicAgentStore(projectId: string) {
  return defineStore(`musicAgent-${projectId}`, () => {
    const flowData = ref<MusicFlowData>({
      audioFile: "",
      songName: "",
      lyrics: "",
      lyricSceneMap: "",
      mvStyle: "",
      script: "",
      mvDesign: null,
    });

    // 用于去重的 Set，存储已发射的标签签名
    const emittedTags = new Set<string>();
    // 记录当前会话已清空过的阶段（避免重复追加旧内容）
    const clearedStages = new Set<string>();
    // 结构化歌词数据，用于写入数据库
    const structuredLyrics = ref<Array<{ text: string; startTime: number; endTime: number; index: number; section: string }>>([]);

    function resetFlowData() {
      // 保留已完成的 lyricSceneMap、mvStyle
      // 只清空 script（通常是当前要生成的阶段）和歌词文本
      const prev = flowData.value;
      flowData.value = {
        audioFile: "",
        songName: "",
        lyrics: "",
        lyricSceneMap: prev.lyricSceneMap,
        mvStyle: prev.mvStyle,
        script: "",
        mvDesign: prev.mvDesign,
      };
      structuredLyrics.value = [];
      emittedTags.clear();
      clearedStages.clear();
    }

    // 生成标签的唯一签名，用于去重
    function tagSignature(tag: string, attrs: Record<string, string> | undefined, value: string): string {
      if (attrs) {
        return `${tag}:${JSON.stringify(attrs)}`;
      }
      return `${tag}:${value}`;
    }

    const { connected, messages, chat, stopGenerate, socket, status, disconnect, connect } = useChat({
      url: `${settingStore().baseUrl}/socket/musicAgent`,
      auth: () => ({
        isolationKey: `${projectId}:musicAgent`,
        projectId: projectId,
      }),
      manageLifecycle: false,
      xmlTags: [
        { tag: "lyricsLine", keepInMessage: false },
        { tag: "scene", keepInMessage: false },
        { tag: "mvScript", keepInMessage: false },
      ],
      onXmlTag: (data) => {
        const { tag, value, children, status, attrs } = data;
        // 通过签名去重，确保每个标签内容只被处理一次
        const sig = tagSignature(tag, attrs, value);
        if (emittedTags.has(sig)) return;
        emittedTags.add(sig);

        if (tag === "lyricsLine") {
          if (attrs) {
            flowData.value.lyrics += `\n[${attrs.startTime || "?"} - ${attrs.endTime || "?"}] ${attrs.text || value}`;
            // 累积结构化歌词数据，用于写入数据库
            if (attrs.text && attrs.startTime && attrs.endTime) {
              structuredLyrics.value.push({
                text: attrs.text,
                startTime: parseFloat(attrs.startTime),
                endTime: parseFloat(attrs.endTime),
                index: structuredLyrics.value.length,
                section: attrs.section || "",
              });
            }
          } else if (value) {
            flowData.value.lyrics += value;
          }
        } else if (tag === "scene") {
          // 首次收到 scene 时清空旧内容
          if (!clearedStages.has("lyricSceneMap")) {
            flowData.value.lyricSceneMap = "";
            clearedStages.add("lyricSceneMap");
          }
          if (attrs) {
            flowData.value.lyricSceneMap += `\n\n### ${attrs.name || "场景"}\n- **类型**: ${attrs.segmentType || ""}\n- **歌词行**: ${attrs.lyrics || ""}\n- **资产**: ${attrs.assets || ""}\n- **描述**: ${attrs.description || ""}`;
          } else if (value) {
            flowData.value.lyricSceneMap += value;
          }
        } else if (tag === "mvScript") {
          // 剧本：完整剧本文档，直接保存
          if (value) {
            flowData.value.script = value;
          }
        }
        if (status === "complete") {
          debouncedSetFlowData();
        }
      },
      autoConnect: false,
    });

    watch(
      socket,
      (s) => {
        if (s) {
          s.on("getMusicPlanData", (_, callback) => {
            callback(flowData.value);
          });
        }
      },
      { immediate: true },
    );

    // 流结束后，将累积的歌词写入数据库，并保存剧本和 flowData
    watch(status, (newStatus) => {
      if (newStatus === "complete" || newStatus === "idle") {
        // 强制保存当前 flowData（确保流式生成的 lyricSceneMap/script 写入后端）
        if (flowData.value.lyricSceneMap || flowData.value.script) {
          setFlowData();
        }
        if (structuredLyrics.value.length > 0) {
          const lyrics = structuredLyrics.value;
          structuredLyrics.value = [];
          axios.post("/musicAgent/saveLyrics", { projectId, lyrics }).catch(() => {});
        }
        // 剧本已由子Agent在服务端保存到 o_script，这里不再重复保存
      }
    });

    async function setFlowData() {
      // script 由子Agent在服务端写入，后端saveMusicFlowData会保留它，前端只保存其他字段
      await axios.post("/musicAgent/saveMusicFlowData", { projectId: projectId, data: JSON.stringify(flowData.value) });
    }

    let saveTimer: any = null;
    function debouncedSetFlowData() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        setFlowData();
      }, 500);
    }

    const thinkLevel = ref(0);

    function updateThinkConfig(value: number) {
      thinkLevel.value = value;
      if (socket.value) {
        socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
      }
    }

    // 包装 chat 方法，发送前重置 flowData
    const originalChat = chat;
    const wrappedChat = (content: string) => {
      resetFlowData();
      return originalChat(content);
    };

    return { connected, messages, chat: wrappedChat, stopGenerate, socket, status, flowData, setFlowData, connect, disconnect, thinkLevel, updateThinkConfig, resetFlowData };
  });

}
const storeMap = new Map<string, ReturnType<typeof makeMusicAgentStore>>();

function createMusicAgentStore(projectId: string) {
  if (!storeMap.has(projectId)) {
    storeMap.set(projectId, makeMusicAgentStore(projectId));
  }
  return storeMap.get(projectId)!;
}

export default function useMusicAgentStore() {
  const id = projectStore().project?.id;
  if (!id) throw new Error("No project selected");
  return createMusicAgentStore(id)();
}