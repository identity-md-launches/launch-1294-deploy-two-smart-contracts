import { formatUnits, getAddress, parseUnits, type Result } from "ethers";

export const key = (value: string) => value.toLowerCase();
export const short = (value: string) =>
  `${value.slice(0, 6)}...${value.slice(-4)}`;
export const hex = (value: number | bigint) =>
  `0x${BigInt(value).toString(16)}`;
export function units(value: bigint, decimals = 18) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(4, "0").slice(0, 4)}`;
}
export function amount(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value))
    throw new Error("Enter an amount with up to 18 decimal places.");
  const result = parseUnits(value, 18);
  if (result <= 0n || result >= 2n ** 256n)
    throw new Error(
      "Enter an amount greater than zero and within the token range.",
    );
  return result;
}
export function address(value: string) {
  let result: string;
  try {
    result = getAddress(value.trim());
  } catch {
    throw new Error("Enter a valid Ethereum address.");
  }
  if (/^0x0{40}$/i.test(result))
    throw new Error("The address must not be zero.");
  return result;
}
export function checkedText(
  text: string,
  min: number,
  max: number,
  label: string,
) {
  if (
    text.length < min ||
    text.length > max ||
    /[^\x20-\x7e]|["\\\[\]]/.test(text)
  ) {
    throw new Error(
      `${label}: use ${min}–${max} printable ASCII characters, without double quotes, backslashes or square brackets.`,
    );
  }
  return text;
}
export type Application = {
  project: string;
  name: string;
  url: string;
  rate: string;
  beneficiary: string;
};
export type FieldErrors = Partial<Record<keyof Application, string>>;
export function applicationErrors(form: Application): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of ["project", "beneficiary"] as const) {
    try {
      address(form[field]);
    } catch (e) {
      errors[field] = (e as Error).message;
    }
  }
  try {
    checkedText(form.name, 1, 48, "Name");
  } catch (e) {
    errors.name = (e as Error).message;
  }
  try {
    checkedText(form.url, 12, 200, "Source URL");
    if (!form.url.startsWith("https://"))
      throw new Error("Source URL must start with https://.");
  } catch (e) {
    errors.url = (e as Error).message;
  }
  if (
    !/^\d+$/.test(form.rate) ||
    Number(form.rate) < 25 ||
    Number(form.rate) > 100
  )
    errors.rate =
      "Choose a whole number from 25 to 100 basis points (0.25%–1%).";
  return errors;
}
export const applicationArgs = (form: Application) => [
  address(form.project),
  form.name,
  form.url,
  Number(form.rate),
  address(form.beneficiary),
];
export type ChainEvent = {
  name: string;
  args: Result;
  block: number;
  index: number;
  tx: string;
};
export type Period = { from: number; to: number | null };
export type Project = {
  address: string;
  name: string;
  url: string;
  periods: Period[];
  outcome: string;
};
export type Credit = ChainEvent & { eligible: boolean };
export type Subtotal = {
  address: string;
  cashback: bigint;
  points: bigint;
  shares: bigint;
};
export type Trader = Subtotal & { projects: Map<string, Subtotal> };
export type ProjectTotal = {
  address: string;
  points: bigint;
  traders: Set<string>;
};
export type Summary = ReturnType<typeof summarize>;
export function summarize(stacks: ChainEvent[], events: ChainEvent[]) {
  const projects = new Map<string, Project>();
  for (const e of events) {
    if (!e.args.project) continue;
    const id = key(e.args.project);
    const p: Project = projects.get(id) ?? {
      address: e.args.project,
      name: short(e.args.project),
      url: "",
      periods: [],
      outcome: "Applied",
    };
    switch (e.name) {
      case "Applied":
        p.name = e.args.name;
        p.url = e.args.sourceUrl;
        p.outcome = "Applied";
        break;
      case "Listed":
        p.periods.push({ from: Number(e.args.fromBlock), to: null });
        p.outcome = "Listed";
        break;
      case "Delisted": {
        const period = p.periods.at(-1);
        if (period && period.to === null) period.to = Number(e.args.toBlock);
        p.outcome = "Delisted";
        break;
      }
      case "Rejected":
        p.outcome = "Rejected";
        break;
      case "Challenged":
        p.outcome = "Under challenge";
        break;
      case "Defended":
        p.outcome = "Listed";
        break;
      case "AskCleared":
        p.outcome =
          p.periods.at(-1)?.to === null
            ? "Listed"
            : "Applied (question cleared)";
        break;
    }
    projects.set(id, p);
  }
  const traders = new Map<string, Trader>(),
    projectTotals = new Map<string, ProjectTotal>();
  const credits: Credit[] = stacks.map((e) => {
    const pid = key(e.args.project),
      id = key(e.args.trader);
    const eligible = !!projects
      .get(pid)
      ?.periods.some(
        (p) => p.from <= e.block && (p.to === null || e.block < p.to),
      );
    const t = traders.get(id) ?? {
      address: e.args.trader,
      cashback: 0n,
      shares: 0n,
      points: 0n,
      projects: new Map<string, Subtotal>(),
    };
    t.cashback += e.args.imd;
    t.shares += e.args.shares;
    if (eligible) t.points += e.args.imd;
    const sub = t.projects.get(pid) ?? {
      address: e.args.project,
      cashback: 0n,
      shares: 0n,
      points: 0n,
    };
    sub.cashback += e.args.imd;
    sub.shares += e.args.shares;
    if (eligible) sub.points += e.args.imd;
    t.projects.set(pid, sub);
    traders.set(id, t);
    if (eligible) {
      const total = projectTotals.get(pid) ?? {
        address: e.args.project,
        points: 0n,
        traders: new Set<string>(),
      };
      total.points += e.args.imd;
      total.traders.add(id);
      projectTotals.set(pid, total);
    }
    return { ...e, eligible };
  });
  const rank = <T extends { points: bigint; address: string }>(items: T[]) =>
    items.sort((a, b) =>
      a.points === b.points
        ? a.address.localeCompare(b.address)
        : a.points > b.points
          ? -1
          : 1,
    );
  return {
    projects,
    traders,
    credits,
    topTraders: rank([...traders.values()].filter((t) => t.points > 0n)),
    topProjects: rank([...projectTotals.values()]),
  };
}
export function duration(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}
