import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";

interface MusicFlowData {
  audioFile: string;
  songName: string;
  lyrics: string;
  mvDirection: string;
  lyricSceneMap: string;
}

function makeMusicAgentStore(projectId: string) {
  return defineStore(`musicAgent-${projectId}`, () => {
    const flowData = ref<MusicFlowData>({
      audioFile: "",
      songName: "",
      lyrics: "",
      mvDirection: "",
      lyricSceneMap: "",
    });

    const { connected, messages, chat, stopGenerate, socket, status, disconnect, connect } = useChat({
      url: `${settingStore().baseUrl}/socket/musicAgent`,
      auth: () => ({
        isolationKey: `${projectId}:musicAgent`,
        projectId: projectId,
      }),
      manageLifecycle: false,
      xmlTags: [
        { tag: "lyricsLine", keepInMessage: false },
        { tag: "mvSegment", keepInMessage: false },
        { tag: "scene", keepInMessage: false },
      ],
      onXmlTag: (data) => {
        const { tag, value, children, status, attrs } = data;
        if (tag === "lyricsLine") {
          flowData.value.lyrics += value;
        } else if (tag === "mvSegment") {
          flowData.value.mvDirection += value;
        } else if (tag === "scene") {
          flowData.value.lyricSceneMap += value;
        }
        if (status === "complete") {
          setFlowData();
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

    async function setFlowData() {
      await axios.post("/musicAgent/saveMusicFlowData", { projectId: projectId, data: JSON.stringify(flowData.value) });
    }

    const thinkLevel = ref(0);

    function updateThinkConfig(value: number) {
      thinkLevel.value = value;
      if (socket.value) {
        socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
      }
    }

    return { connected, messages, chat, stopGenerate, socket, status, flowData, setFlowData, connect, disconnect, thinkLevel, updateThinkConfig };
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