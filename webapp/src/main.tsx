import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  App as AntApp,
  Alert,
  Avatar,
  Button,
  ConfigProvider,
  Dropdown,
  Form,
  Input,
  Layout,
  Menu,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  AppstoreOutlined,
  FolderOutlined,
  VideoCameraOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { api } from "./api";
import { WorkspaceContext } from "./context";
import type { Job, Project, User } from "./types";
const ProjectsPage = lazy(() =>
  import("./projects").then((m) => ({ default: m.ProjectsPage })),
);
const AssetsPage = lazy(() =>
  import("./assets").then((m) => ({ default: m.AssetsPage })),
);
const ShotsPage = lazy(() =>
  import("./shots").then((m) => ({ default: m.ShotsPage })),
);
const JobsPage = lazy(() =>
  import("./jobs").then((m) => ({ default: m.JobsPage })),
);
const SettingsPage = lazy(() =>
  import("./settings").then((m) => ({ default: m.SettingsPage })),
);
import "./style.css";
import {Login,WalletPage} from './account-ui';
const CommercialAdminPage=lazy(()=>import('./commercial-admin').then(m=>({default:m.CommercialAdminPage})));
const pages: Record<string, string> = {
  projects: "我的项目",
  assets: "资产库",
  shots: "分镜脚本",
  jobs: "生成队列",
  settings: "模型与账号",
  wallet: "积分与账号",
  admin: "运营管理",
};
function route() {
  const [name, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return {
    page: pages[name] ? name : "projects",
    project: new URLSearchParams(query).get("project") || "",
  };
}
function Workspace({
  user,
  setUser,
  onLogout,
}: {
  user: User | null;
  setUser: (u: User) => void;
  onLogout: () => void;
}) {
  const [where, setWhere] = useState(route),
    [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [collapsed, setCollapsed] = useState(false),
    [failed, setFailed] = useState(""),
    { message } = AntApp.useApp();
  const refreshBusy = useRef(false);
  const go = useCallback(
    (page: string, project = where.project) => {
      location.hash = `/${page}${project ? "?project=" + encodeURIComponent(project) : ""}`;
    },
    [where.project],
  );
  const reload = useCallback(async () => {
    const r = await api<{ projects: Project[] }>("projects");
    setProjects(r.projects);
  }, []);
  const project = projects.find((p) => p.id === where.project);
  const refreshProject = useCallback(async () => {
    if (!where.project) return;
    const r = await api<{ project: Project }>("projects/" + where.project);
    setProjects((list) =>
      list.map((p) => (p.id === r.project.id ? r.project : p)),
    );
  }, [where.project]);
  useEffect(() => {
    const onHash = () => setWhere(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    reload()
      .catch((e) => setFailed(e.message))
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    if (
      !loading &&
      !where.project &&
      projects.length &&
      where.page !== "projects"
    )
      go(where.page, projects[0].id);
  }, [loading, where, projects, go]);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    const poll = async () => {
      if (refreshBusy.current || document.hidden) return;
      refreshBusy.current = true;
      try {
        const r = await api<{ jobs: Job[] }>(
          "projects/" + project.id + "/jobs",
        );
        if (!alive) return;
        setProjects((list) =>
          list.map((p) =>
            p.id === project.id
              ? { ...p, data: { ...p.data, jobs: r.jobs } }
              : p,
          ),
        );
        if (
          r.jobs.some(
            (j) =>
              j.status === "done" &&
              !project.data.jobs.some(
                (old) => old.id === j.id && old.status === "done",
              ),
          )
        )
          await refreshProject();
      } catch {
      } finally {
        refreshBusy.current = false;
      }
    };
    const timer = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project?.id, project?.data.jobs, refreshProject]);
  const context = {
    projects,
    project,
    reload,
    refreshProject,
    go,
    user,
    setUser,
  };
  return (
    <WorkspaceContext.Provider value={context}>
      <Layout className="workspace">
        <Layout.Sider
          width={216}
          theme="light"
          breakpoint="lg"
          collapsedWidth={64}
          onCollapse={setCollapsed}
        >
          <div className="sidebar-head">
            <Select
              aria-label="切换项目"
              placeholder="选择项目"
              showSearch
              popupMatchSelectWidth={240}
              labelRender={({ label }) =>
                collapsed ? <FolderOutlined /> : label
              }
              optionFilterProp="label"
              value={project?.id}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => go(where.page, id)}
            />
          </div>
          <Menu
            mode="inline"
            selectedKeys={[where.page]}
            onClick={(e) => go(e.key, project?.id || projects[0]?.id || "")}
            items={[
              { key: "projects", icon: <FolderOutlined />, label: "我的项目" },
              { key: "assets", icon: <AppstoreOutlined />, label: "资产库" },
              {
                key: "shots",
                icon: <VideoCameraOutlined />,
                label: "分镜脚本",
              },
              {
                key: "jobs",
                icon: <UnorderedListOutlined />,
                label: "生成队列",
              },
            ]}
          />
          <div className="sidebar-bottom">
            <Menu
              mode="inline"
              selectedKeys={[where.page]}
              onClick={(e) => go(e.key)}
              items={[
                {
                  key: "settings",
                  icon: <SettingOutlined />,
                  label: "模型与账号",
                },
                {key:'admin',label:'运营管理',icon:<SettingOutlined/>},
                {key:'wallet',label:'积分与账号',icon:<UserOutlined/>},
              ].filter(i=>i.key==='wallet'||!user||user.role==='admin')}
            />
          </div>
        </Layout.Sider>
        <Layout>
          <Layout.Header className="topbar">
            <Space>
              <Typography.Text type="secondary">
                {project?.name || "工作台"}
              </Typography.Text>
              <span className="slash">/</span>
              <Typography.Text>{pages[where.page]}</Typography.Text>
            </Space>
            <Dropdown
              menu={{
                items: [
                  {
                    key: "account",
                    label: "账号设置",
                    icon: <SettingOutlined />,
                    onClick: () => go("wallet"),
                  },
                  {
                    key: "logout",
                    label: "退出登录",
                    icon: <LogoutOutlined />,
                    onClick: async () => {
                      try {
                        await api("auth/logout", "POST", {});
                        onLogout();
                      } catch (e) {
                        message.error((e as Error).message);
                      }
                    },
                  },
                ],
              }}
            >
              <Button type="text">
                <Avatar size="small" icon={<UserOutlined />} />
                {user?.username || "本地模式"}
              </Button>
            </Dropdown>
          </Layout.Header>
          <Layout.Content className="content">
            <Suspense
              fallback={
                <div className="page-loading">
                  <Spin />
                </div>
              }
            >
              {loading ? (
                <div className="page-loading">
                  <Spin size="large" />
                </div>
              ) : failed ? (
                <Alert
                  type="error"
                  title={failed}
                  action={
                    <Button
                      onClick={() => {
                        setFailed("");
                        reload().catch((e) => setFailed(e.message));
                      }}
                    >
                      重试
                    </Button>
                  }
                />
              ) : where.page === "projects" ? (
                <ProjectsPage />
              ) : where.page === "wallet" ? (
                <WalletPage />
              ) : where.page === "admin" ? (
                user?.role==='admin'?<CommercialAdminPage/>:<Alert type="error" title="仅限管理员"/>
              ) : where.page === "settings" ? (
                !user||user.role==='admin'?<SettingsPage />:<WalletPage/>
              ) : !project ? (
                <Alert
                  type="info"
                  title="请先选择一个项目"
                  action={
                    <Button onClick={() => go("projects")}>我的项目</Button>
                  }
                />
              ) : where.page === "assets" ? (
                <AssetsPage key={project.id} />
              ) : where.page === "shots" ? (
                <ShotsPage key={project.id} />
              ) : (
                <JobsPage key={project.id} />
              )}
            </Suspense>
          </Layout.Content>
        </Layout>
      </Layout>
    </WorkspaceContext.Provider>
  );
}
class PageBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="page-loading">
        <Alert
          type="error"
          title="页面加载失败"
          description="请刷新页面重试，已提交的任务不受影响。"
          action={<Button onClick={() => location.reload()}>刷新页面</Button>}
        />
      </div>
    ) : (
      this.props.children
    );
  }
}
function Root() {
  const [session, setSession] = useState<{
      authenticated: boolean;
      user: User | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("auth/session")
      .then(setSession)
      .catch((e) => setError(e.message));
    const expired = () => setSession({ authenticated: false, user: null });
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (error)
    return (
      <div className="login-page">
        <Alert
          type="error"
          title={error}
          action={<Button onClick={() => location.reload()}>重试</Button>}
        />
      </div>
    );
  if (!session)
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    );
  return session.authenticated ? (
    <Workspace
      user={session.user}
      setUser={(user) => setSession({ authenticated: true, user })}
      onLogout={() => setSession({ authenticated: false, user: null })}
    />
  ) : (
    <Login onLogin={(user) => setSession({ authenticated: true, user })} />
  );
}
createRoot(document.getElementById("root")!).render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: "#3263e7",
        colorBgLayout: "#f7f8fa",
        borderRadius: 9,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        controlHeight: 38,
      },
      components: {
        Layout: { headerBg: "#ffffff", siderBg: "#ffffff" },
        Menu: { itemHeight: 44 },
      },
    }}
  >
    <AntApp>
      <PageBoundary>
        <Root />
      </PageBoundary>
    </AntApp>
  </ConfigProvider>,
);
