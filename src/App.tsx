import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Compass,
  Heart,
  MapPin,
  Menu,
  Pencil,
  Search,
  Sparkles,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";

type Connection = "suggested" | "pending" | "friend" | "incoming" | "dismissed";
type Tab = "discover" | "friends" | "requests";
type Person = {
  id: number;
  name: string;
  role: string;
  city: string;
  bio: string;
  interests: string[];
  mutual: number;
  color: string;
  connection: Connection;
};
type Profile = {
  name: string;
  role: string;
  city: string;
  bio: string;
  interests: string[];
};
const initialProfile: Profile = {
  name: "Ngân Nguyễn",
  role: "Một người thích những điều nhỏ xinh",
  city: "TP. Hồ Chí Minh",
  bio: "Gom một chút nắng, một chút cà phê và thật nhiều câu chuyện hay. Rất vui được gặp bạn ở đây!",
  interests: ["Thiết kế", "Cà phê", "Du lịch"],
};
const initialPeople: Person[] = [
  {
    id: 1,
    name: "Linh Phạm",
    role: "Nhà thiết kế · người yêu màu sắc",
    city: "TP. Hồ Chí Minh",
    bio: "Thích kể chuyện bằng hình ảnh và tìm những quán cà phê có cửa sổ đầy nắng.",
    interests: ["Thiết kế", "Cà phê"],
    mutual: 4,
    color: "peach",
    connection: "suggested",
  },
  {
    id: 2,
    name: "Minh Anh",
    role: "Nhiếp ảnh gia · mê những chuyến đi",
    city: "Đà Nẵng",
    bio: "Luôn mang theo máy ảnh. Mỗi chuyến đi là một câu chuyện mới.",
    interests: ["Nhiếp ảnh", "Du lịch"],
    mutual: 3,
    color: "sage",
    connection: "suggested",
  },
  {
    id: 3,
    name: "Tuấn Trần",
    role: "Lập trình viên · thích làm điều mới",
    city: "Hà Nội",
    bio: "Làm sản phẩm nhỏ, đọc sách lớn. Tìm bạn cùng chia sẻ những ý tưởng hay.",
    interests: ["Công nghệ", "Sách"],
    mutual: 2,
    color: "lavender",
    connection: "suggested",
  },
  {
    id: 4,
    name: "Hà My",
    role: "Sáng tạo nội dung · yêu cuộc sống",
    city: "TP. Hồ Chí Minh",
    bio: "Những ngày bình thường cũng có thể rất đặc biệt. Cùng tìm niềm vui mỗi ngày nhé.",
    interests: ["Âm nhạc", "Du lịch"],
    mutual: 5,
    color: "yellow",
    connection: "suggested",
  },
  {
    id: 5,
    name: "Bảo Ngọc",
    role: "Illustrator · một chút mộng mơ",
    city: "Đà Lạt",
    bio: "Vẽ những điều mình yêu. Thích cây xanh, mèo và buổi chiều chậm rãi.",
    interests: ["Thiết kế", "Nghệ thuật"],
    mutual: 2,
    color: "rose",
    connection: "suggested",
  },
  {
    id: 6,
    name: "Đức Hoàng",
    role: "Người kể chuyện · bạn của sách",
    city: "Hà Nội",
    bio: "Có cuốn sách nào bạn muốn giới thiệu không? Mình luôn sẵn sàng lắng nghe.",
    interests: ["Sách", "Cà phê"],
    mutual: 1,
    color: "sky",
    connection: "suggested",
  },
  {
    id: 7,
    name: "Thảo Lê",
    role: "Yêu nghệ thuật và những điều tử tế",
    city: "TP. Hồ Chí Minh",
    bio: "Mình tin những cuộc gặp gỡ nhỏ có thể mang lại niềm vui lớn.",
    interests: ["Nghệ thuật", "Thiết kế"],
    mutual: 3,
    color: "rose",
    connection: "incoming",
  },
  {
    id: 8,
    name: "Quang Nguyễn",
    role: "Chạy bộ, cà phê và khám phá",
    city: "Đà Nẵng",
    bio: "Cùng chạy một vòng rồi đi uống cà phê nhé!",
    interests: ["Thể thao", "Cà phê"],
    mutual: 2,
    color: "sky",
    connection: "incoming",
  },
  {
    id: 9,
    name: "Khánh Vy",
    role: "Thích đọc sách dưới tán cây",
    city: "TP. Hồ Chí Minh",
    bio: "Một người bạn của sách và những câu chuyện nhẹ nhàng.",
    interests: ["Sách", "Du lịch"],
    mutual: 2,
    color: "sage",
    connection: "friend",
  },
  {
    id: 10,
    name: "Nam Đỗ",
    role: "Âm nhạc làm mọi thứ vui hơn",
    city: "Hà Nội",
    bio: "Chia sẻ playlist, tìm bạn đi xem nhạc và làm quen với những điều mới.",
    interests: ["Âm nhạc", "Công nghệ"],
    mutual: 1,
    color: "lavender",
    connection: "friend",
  },
];
const storageKey = "massege-profile-v1";
function loadData(): { profile: Profile; people: Person[] } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      const p = saved.profile;
      if (
        p &&
        ["name", "role", "city", "bio"].every(
          (k) => typeof p[k] === "string",
        ) &&
        Array.isArray(p.interests) &&
        p.interests.every((i: unknown) => typeof i === "string")
      ) {
        const statuses: Connection[] = [
          "suggested",
          "pending",
          "friend",
          "incoming",
          "dismissed",
        ];
        return {
          profile: p,
          people: initialPeople.map((person) => ({
            ...person,
            connection: statuses.includes(saved.connections?.[person.id])
              ? saved.connections[person.id]
              : person.connection,
          })),
        };
      }
    }
  } catch {
    /* Unsupported storage or invalid local data: use the sample profile. */
  }
  return { profile: initialProfile, people: initialPeople };
}

function Flower() {
  return (
    <svg viewBox="0 0 100 100" width="1em" height="1em" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="45"
          y="3"
          width="10"
          height="47"
          rx="5"
          fill="currentColor"
          transform={`rotate(${i * 45} 50 50)`}
        />
      ))}
    </svg>
  );
}

function Avatar({
  id = 0,
  color = "peach",
  size = "",
  name,
}: {
  id?: number;
  color?: string;
  size?: string;
  name: string;
}) {
  const longHair = id % 3 !== 2;
  return (
    <span
      className={`avatar ${color} ${size}`}
      role="img"
      aria-label={`Ảnh đại diện ${name}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path
          d="M17 102c1-28 15-38 33-38s32 10 33 38"
          fill={["#ed785f", "#547968", "#706489", "#558198"][id % 4]}
        />
        {longHair && (
          <path d="M25 61V42c0-37 51-37 51 0v32H25" fill="#493330" />
        )}
        <path d="M42 63h16v13c-5 7-11 7-16 0" fill="#dc9b78" />
        <ellipse
          cx="50"
          cy="43"
          rx="21"
          ry="26"
          fill={id % 2 ? "#eaba94" : "#f4c5a2"}
        />
        <path
          d="M28 39c-6-28 40-37 45-5-17 1-24-4-28-10-1 8-8 13-17 15"
          fill="#493330"
        />
        <circle cx="42" cy="44" r="1.8" fill="#493330" />
        <circle cx="58" cy="44" r="1.8" fill="#493330" />
        <path
          d="M44 55q6 5 12 0"
          stroke="#aa624f"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        {id % 3 === 2 && (
          <g fill="none" stroke="#493330" strokeWidth="1.5">
            <rect x="33" y="39" width="14" height="11" rx="4" />
            <rect x="53" y="39" width="14" height="11" rx="4" />
            <path d="M47 42h6" />
          </g>
        )}
      </svg>
    </span>
  );
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement as HTMLElement;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className="modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Đóng" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function App() {
  const [initial] = useState(loadData);
  const [profile, setProfile] = useState(initial.profile);
  const [people, setPeople] = useState(initial.people);
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("");
  const [interest, setInterest] = useState("Tất cả");
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const friends = people.filter((p) => p.connection === "friend");
  const incoming = people.filter((p) => p.connection === "incoming");
  const pending = people.filter((p) => p.connection === "pending");
  const selected = people.find((p) => p.id === viewing);
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          profile,
          connections: Object.fromEntries(
            people.map((p) => [p.id, p.connection]),
          ),
        }),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [people, profile]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    setQuery("");
    setInterest("Tất cả");
    setMenuOpen(false);
  }
  function connect(person: Person, next: Connection) {
    setPeople((current) =>
      current.map((p) => (p.id === person.id ? { ...p, connection: next } : p)),
    );
    setToast(
      next === "pending"
        ? `Đã gửi lời mời cho ${person.name}`
        : next === "friend"
          ? `Bạn và ${person.name} đã trở thành bạn bè!`
          : next === "dismissed"
            ? `Đã từ chối lời mời của ${person.name}`
            : "Đã hủy lời mời kết bạn",
    );
  }
  function actions(person: Person) {
    if (person.connection === "friend")
      return (
        <span className="friend-state">
          <UserRoundCheck size={16} /> Đã là bạn bè
        </span>
      );
    if (person.connection === "pending")
      return (
        <button
          className="button pending"
          onClick={() => connect(person, "suggested")}
        >
          <Check size={16} /> Đã gửi · Hủy
        </button>
      );
    if (person.connection === "incoming")
      return (
        <div className="request-actions">
          <button
            className="button primary"
            onClick={() => connect(person, "friend")}
          >
            <Check size={16} /> Chấp nhận
          </button>
          <button
            className="button secondary"
            onClick={() => connect(person, "dismissed")}
          >
            Từ chối
          </button>
        </div>
      );
    return (
      <button
        className="button connect"
        onClick={() => connect(person, "pending")}
      >
        <UserRoundPlus size={16} /> Kết bạn
      </button>
    );
  }
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  const visible = people.filter((p) => {
    const matchesTab =
      tab === "discover"
        ? ["suggested", "pending"].includes(p.connection)
        : tab === "friends"
          ? p.connection === "friend"
          : ["incoming", "pending"].includes(p.connection);
    return (
      matchesTab &&
      normalize(
        `${p.name} ${p.role} ${p.city} ${p.interests.join(" ")}`,
      ).includes(normalize(query)) &&
      (interest === "Tất cả" || p.interests.includes(interest))
    );
  });
  const titles = {
    discover: "Những kết nối mới, những câu chuyện mới.",
    friends: "Có bạn bè, mỗi ngày đều vui hơn.",
    requests: "Một lời chào có thể mở đầu tình bạn.",
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("discover");
          }}
        >
          <span className="brand-icon">m</span>massege
          <span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">GÓC NHỎ CỦA BẠN</div>
        <nav aria-label="Điều hướng chính">
          <button
            className={tab === "discover" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("discover")}
          >
            <Compass size={20} /> Khám phá
            <span className="active-dot" />
          </button>
          <button
            className={tab === "friends" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("friends")}
          >
            <UsersRound size={20} /> Bạn bè
            <span className="nav-count">{friends.length}</span>
          </button>
          <button
            className={tab === "requests" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("requests")}
          >
            <UserRoundPlus size={20} /> Lời mời
            {incoming.length > 0 && (
              <span className="nav-count coral">{incoming.length}</span>
            )}
          </button>
          <button
            className="nav-link"
            onClick={() => {
              setEditing(true);
              setMenuOpen(false);
            }}
          >
            <UserRound size={20} /> Hồ sơ của tôi
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-flower">
            <Flower />
          </span>
          <h3>
            Một kết nối nhỏ.
            <br />
            Nhiều niềm vui lớn.
          </h3>
          <p>Bắt đầu bằng một lời chào với người cùng sở thích.</p>
          <button onClick={() => navigate("discover")}>
            Tìm người bạn mới <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="sidebar-footer">
          <Avatar name={profile.name} size="small" />
          <div>
            <strong>{profile.name}</strong>
            <span>Hồ sơ của bạn</span>
          </div>
          <button
            className="icon-button"
            aria-label="Chỉnh sửa hồ sơ"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="page-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={22} />
            </button>
            <span>Cộng đồng</span>
            <ChevronRight size={15} />
            <strong>
              {tab === "discover"
                ? "Khám phá"
                : tab === "friends"
                  ? "Bạn bè"
                  : "Lời mời"}
            </strong>
          </div>
          <div className="topbar-tools">
            <span className="demo-pill">Bản trải nghiệm</span>
            <button
              className="notification-button icon-button"
              aria-label={`Lời mời kết bạn: ${incoming.length}`}
              onClick={() => navigate("requests")}
            >
              <Bell size={20} />
              {incoming.length > 0 && <i />}
            </button>
            <button
              className="avatar-button"
              aria-label="Mở hồ sơ của tôi"
              onClick={() => setEditing(true)}
            >
              <Avatar name={profile.name} size="small" />
            </button>
          </div>
        </header>
        <main>
          <div className="welcome">
            <div>
              <p className="eyebrow">KẾT NỐI THEO CÁCH CỦA BẠN</p>
              <h1>
                Chào {profile.name.trim().split(" ")[0]}, thật vui khi có bạn{" "}
                <span>✺</span>
              </h1>
              <p>{titles[tab]}</p>
            </div>
            <div className="welcome-symbol" aria-hidden="true">
              <Heart size={22} />
              <span>made for connection</span>
            </div>
          </div>
          {storageError && (
            <div className="storage-warning" role="alert">
              Trình duyệt đang chặn lưu trữ. Thay đổi trong phiên này sẽ không
              được giữ khi tải lại.
            </div>
          )}
          <div className="content-layout">
            <div className="main-column">
              <section className="profile-card" aria-label="Hồ sơ cá nhân">
                <div className="profile-cover">
                  <div className="cover-orbit orbit-one" />
                  <div className="cover-orbit orbit-two" />
                  <span className="cover-star">
                    <Flower />
                  </span>
                  <div className="cover-message">
                    a little more you.
                    <br />
                    <span>a little more connected.</span>
                  </div>
                  <span className="cover-squiggle">
                    <svg
                      viewBox="0 0 100 50"
                      width="1.1em"
                      height=".6em"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 35Q18 5 34 25T64 25T96 15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span className="cover-label">YOUR SPACE, YOUR STORY</span>
                </div>
                <div className="profile-body">
                  <div className="profile-top">
                    <Avatar name={profile.name} size="profile-avatar" />
                    <button
                      className="button secondary edit-button"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil size={14} /> Chỉnh sửa hồ sơ
                    </button>
                  </div>
                  <div className="profile-name">
                    <h2>{profile.name}</h2>
                    <span className="you-label">Bạn</span>
                  </div>
                  <p className="profile-role">{profile.role}</p>
                  <p className="profile-bio">{profile.bio}</p>
                  <div className="profile-meta">
                    <span>
                      <MapPin size={15} />
                      {profile.city}
                    </span>
                    <button onClick={() => navigate("friends")}>
                      <UsersRound size={15} />
                      <strong>{friends.length}</strong> bạn bè
                    </button>
                  </div>
                  <div className="profile-interests">
                    {profile.interests.map((item, index) => (
                      <span key={`${item}-${index}`}>
                        {index === 0 ? (
                          <Sparkles size={11} />
                        ) : index === 1 ? (
                          <Heart size={11} />
                        ) : (
                          <ArrowUpRight size={11} />
                        )}{" "}
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
              <section
                className="connections-section"
                aria-labelledby="connections-heading"
              >
                <div className="section-heading">
                  <div>
                    <h2 id="connections-heading">
                      {tab === "discover"
                        ? "Có thể bạn muốn làm quen"
                        : tab === "friends"
                          ? "Những người bạn của bạn"
                          : "Lời mời kết bạn"}
                      <span className="heading-dot">.</span>
                    </h2>
                    <p>
                      {tab === "discover"
                        ? "Tìm thấy nhau qua những điều cả hai cùng yêu thích."
                        : tab === "friends"
                          ? "Ghé thăm hồ sơ và khám phá câu chuyện của bạn bè."
                          : `${incoming.length} lời mời nhận được · ${pending.length} lời mời đã gửi`}
                    </p>
                  </div>
                  <Sparkles size={22} />
                </div>
                <div className="connection-toolbar">
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label="Danh sách kết nối"
                  >
                    {(["discover", "friends", "requests"] as Tab[]).map((t) => (
                      <button
                        key={t}
                        id={`tab-${t}`}
                        role="tab"
                        aria-selected={tab === t}
                        aria-controls="connections-panel"
                        tabIndex={tab === t ? 0 : -1}
                        className={tab === t ? "selected" : ""}
                        onClick={() => navigate(t)}
                        onKeyDown={(e) => {
                          const tabs: Tab[] = [
                            "discover",
                            "friends",
                            "requests",
                          ];
                          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                            e.preventDefault();
                            const next =
                              tabs[
                                (tabs.indexOf(t) +
                                  (e.key === "ArrowRight" ? 1 : 2)) %
                                  3
                              ];
                            navigate(next);
                            document.getElementById(`tab-${next}`)?.focus();
                          }
                        }}
                      >
                        {t === "discover"
                          ? "Khám phá"
                          : t === "friends"
                            ? "Bạn bè"
                            : "Lời mời"}
                        {t === "requests" && incoming.length > 0 && (
                          <span>{incoming.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Tìm tên, địa điểm hoặc sở thích"
                      placeholder="Tìm một người bạn..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Xóa tìm kiếm"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                </div>
                <div
                  className="interest-filters"
                  aria-label="Lọc theo sở thích"
                >
                  {["Tất cả", "Thiết kế", "Cà phê", "Du lịch", "Sách"].map(
                    (item) => (
                      <button
                        key={item}
                        aria-pressed={interest === item}
                        className={interest === item ? "selected" : ""}
                        onClick={() => setInterest(item)}
                      >
                        {item === "Tất cả" && <span>✦ </span>}
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <div
                  id="connections-panel"
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                  className="people-grid"
                >
                  {visible.map((person) => (
                    <article className="person-card" key={person.id}>
                      <button
                        className="person-overview"
                        aria-label={`Xem hồ sơ ${person.name}`}
                        onClick={() => setViewing(person.id)}
                      >
                        <div className="person-avatar-row">
                          <Avatar
                            id={person.id}
                            name={person.name}
                            color={person.color}
                            size="medium"
                          />
                          <ArrowUpRight size={17} className="profile-arrow" />
                        </div>
                        <h3>{person.name}</h3>
                        <p>{person.role}</p>
                      </button>
                      <div className="person-tags">
                        {person.interests.map((i) => (
                          <span key={i}>{i}</span>
                        ))}
                      </div>
                      <div className="mutual-friends">
                        <span className="mini-avatars">
                          <Avatar id={9} name="Bạn chung" color="sage" />
                          <Avatar id={10} name="Bạn chung" color="lavender" />
                        </span>
                        <span>{person.mutual} bạn chung · minh họa</span>
                      </div>
                      {tab === "requests" && (
                        <span className="request-direction">
                          {person.connection === "incoming" ? (
                            <ArrowDownLeft size={13} />
                          ) : (
                            <ArrowUpRight size={13} />
                          )}
                          {person.connection === "incoming"
                            ? "Lời mời nhận được"
                            : "Lời mời đã gửi"}
                        </span>
                      )}
                      {actions(person)}
                    </article>
                  ))}
                </div>
                {visible.length === 0 && (
                  <div className="empty-state">
                    <UsersRound size={36} />
                    <h3>
                      {query || interest !== "Tất cả"
                        ? "Chưa tìm thấy người phù hợp"
                        : tab === "requests"
                          ? "Bạn đã xem hết lời mời rồi!"
                          : "Một tình bạn mới đang chờ bạn"}
                    </h3>
                    <p>
                      {query || interest !== "Tất cả"
                        ? "Thử một tên hoặc sở thích khác nhé."
                        : "Ghé Khám phá để tìm thêm người bạn mới."}
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        if (!query && interest === "Tất cả")
                          navigate("discover");
                        else {
                          setQuery("");
                          setInterest("Tất cả");
                        }
                      }}
                    >
                      {query || interest !== "Tất cả"
                        ? "Xóa bộ lọc"
                        : "Khám phá bạn mới"}
                    </button>
                  </div>
                )}
              </section>
            </div>
            <aside className="right-column">
              <section className="requests-card">
                <div className="aside-heading">
                  <h2>
                    Lời chào mới <span>{incoming.length}</span>
                  </h2>
                  <Heart size={17} />
                </div>
                <p className="aside-description">
                  Có người muốn kết nối với bạn.
                </p>
                {incoming.slice(0, 2).map((person) => (
                  <div className="small-request" key={person.id}>
                    <button
                      className="request-profile"
                      onClick={() => setViewing(person.id)}
                    >
                      <Avatar
                        id={person.id}
                        name={person.name}
                        color={person.color}
                        size="small"
                      />
                      <span>
                        <strong>{person.name}</strong>
                        <small>{person.mutual} bạn chung · minh họa</small>
                      </span>
                    </button>
                    <div className="small-actions">
                      <button onClick={() => connect(person, "friend")}>
                        Chấp nhận
                      </button>
                      <button
                        aria-label={`Từ chối ${person.name}`}
                        onClick={() => connect(person, "dismissed")}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                ))}
                {incoming.length === 0 && (
                  <p className="no-requests">
                    <Check size={18} /> Đã xem hết lời mời
                  </p>
                )}
                <button
                  className="text-link"
                  onClick={() => navigate("requests")}
                >
                  Xem tất cả lời mời <ChevronRight size={15} />
                </button>
              </section>
              <section className="community-card">
                <span className="community-label">CÙNG MỘT TẦN SỐ</span>
                <div className="community-art" aria-hidden="true">
                  <span>
                    <Flower />
                  </span>
                  <span>
                    <svg
                      viewBox="0 0 100 100"
                      width="1em"
                      height="1em"
                      aria-hidden="true"
                    >
                      <path
                        d="M50 0 60 34 88 12 66 40 100 50 66 60 88 88 60 66 50 100 40 66 12 88 34 60 0 50 34 40 12 12 40 34Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>
                    <Flower />
                  </span>
                </div>
                <h2>
                  Đúng sở thích.
                  <br />
                  Đúng người bạn.
                </h2>
                <p>
                  Một cuốn sách, một bản nhạc, một tách cà phê. Tình bạn đôi khi
                  bắt đầu thật đơn giản.
                </p>
                <button
                  onClick={() => {
                    navigate("discover");
                    setInterest("Cà phê");
                  }}
                >
                  Tìm bạn mê cà phê <ArrowUpRight size={16} />
                </button>
              </section>
              <section className="profile-tip">
                <div className="tip-icon">
                  <Sparkles size={19} />
                </div>
                <div>
                  <h3>Thêm một chút về bạn</h3>
                  <p>
                    Hồ sơ có sở thích giúp những người cùng tần số tìm thấy bạn.
                  </p>
                  <button onClick={() => setEditing(true)}>
                    Cập nhật hồ sơ <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
              <footer className="page-footer">
                <span>massege. © 2026</span>
                <p>Một nơi để kết nối, một nơi để là bạn.</p>
                <small>Hồ sơ mẫu · dữ liệu lưu trên trình duyệt</small>
              </footer>
            </aside>
          </div>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button aria-label="Đóng thông báo" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <EditProfile
          profile={profile}
          close={() => setEditing(false)}
          save={(p) => {
            setProfile(p);
            setEditing(false);
            setToast("Đã lưu hồ sơ của bạn");
          }}
        />
      )}
      {selected && (
        <Modal title="Một người bạn mới" close={() => setViewing(null)}>
          <div className="detail-profile">
            <Avatar
              id={selected.id}
              name={selected.name}
              color={selected.color}
              size="large"
            />
            <h2>{selected.name}</h2>
            <p>{selected.role}</p>
            <span className="detail-city">
              <MapPin size={15} />
              {selected.city}
            </span>
            <p className="detail-bio">{selected.bio}</p>
            <div className="person-tags">
              {selected.interests.map((i) => (
                <span key={i}>{i}</span>
              ))}
            </div>
            {actions(selected)}
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditProfile({
  profile,
  close,
  save,
}: {
  profile: Profile;
  close: () => void;
  save: (p: Profile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [interests, setInterests] = useState(profile.interests.join(", "));
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.role.trim() || !draft.city.trim()) {
      setError("Vui lòng điền tên, giới thiệu ngắn và địa điểm.");
      return;
    }
    save({
      ...draft,
      name: draft.name.trim(),
      role: draft.role.trim(),
      city: draft.city.trim(),
      bio: draft.bio.trim(),
      interests: [
        ...new Set(
          interests
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
        ),
      ].slice(0, 5),
    });
  }
  return (
    <Modal title="Một chút về bạn" close={close}>
      <p className="modal-description">
        Cho những người bạn mới biết điều gì làm nên bạn.
      </p>
      <form className="profile-form" onSubmit={submit}>
        <label>
          Tên của bạn
          <input
            autoFocus
            required
            maxLength={50}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Giới thiệu ngắn
          <input
            required
            maxLength={80}
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          />
        </label>
        <label>
          Địa điểm
          <input
            required
            maxLength={60}
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          />
        </label>
        <label>
          Câu chuyện của bạn
          <textarea
            rows={3}
            maxLength={240}
            value={draft.bio}
            onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          />
        </label>
        <label>
          Sở thích
          <input
            aria-label="Sở thích"
            aria-describedby="interests-help"
            maxLength={120}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
          />
          <small id="interests-help">
            Ngăn cách bằng dấu phẩy, tối đa 5 sở thích.
          </small>
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            Để sau
          </button>
          <button className="button primary" type="submit">
            Lưu hồ sơ <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
