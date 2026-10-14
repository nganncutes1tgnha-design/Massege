export type Connection =
  | "suggested"
  | "pending"
  | "friend"
  | "incoming"
  | "dismissed";
export type Tab = "discover" | "friends" | "requests";
export type Person = {
  id: number | string;
  name: string;
  role: string;
  city: string;
  bio: string;
  interests: string[];
  mutual: number;
  color: string;
  connection: Connection;
};
export type Profile = {
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
export const storageKey = "massege-profile-v1";
export function loadData(): { profile: Profile; people: Person[] } {
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
