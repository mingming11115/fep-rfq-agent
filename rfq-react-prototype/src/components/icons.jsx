import React from 'react';
import {
  AppstoreOutlined, ApartmentOutlined, ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined,
  BellOutlined, BookOutlined, BranchesOutlined, BuildOutlined, CalendarOutlined, CheckCircleOutlined,
  CheckOutlined, ClockCircleOutlined, CloseOutlined, CloudUploadOutlined, CommentOutlined, ControlOutlined,
  CopyOutlined, DashboardOutlined, DatabaseOutlined, DeleteOutlined, DownloadOutlined, EditOutlined,
  EllipsisOutlined, ExclamationCircleOutlined, ExportOutlined, FileDoneOutlined, FileSearchOutlined,
  FileTextOutlined, FilterOutlined, FolderOpenOutlined, GlobalOutlined, HddOutlined, HistoryOutlined,
  InfoCircleOutlined, LeftOutlined, LoadingOutlined, LockOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  MinusOutlined, PlusOutlined, QuestionCircleOutlined, RedoOutlined, ReloadOutlined, RightOutlined,
  RiseOutlined, FallOutlined, RollbackOutlined, SafetyCertificateOutlined, SaveOutlined, SearchOutlined,
  SendOutlined, SettingOutlined, SolutionOutlined, TeamOutlined, ThunderboltOutlined, UnorderedListOutlined,
  UpOutlined, DownOutlined, UserSwitchOutlined, WarningOutlined,
} from '@ant-design/icons';

// Business views use one icon family. This adapter preserves their existing size
// prop and forwards refs so antd Tooltip and Button can attach to the icon.
const icon = Component => React.forwardRef(function BusinessIcon({ size = 16, style, ...props }, ref) {
  return <Component aria-hidden={props['aria-label'] ? undefined : true} {...props} ref={ref} style={{ fontSize: size, ...style }} />;
});
export const Activity = icon(RiseOutlined);
export const AlertCircle = icon(ExclamationCircleOutlined);
export const AlertTriangle = icon(WarningOutlined);
export const ArrowLeft = icon(ArrowLeftOutlined);
export const ArrowRight = icon(ArrowRightOutlined);
export const ArrowUpRight = icon(ExportOutlined);
export const Bell = icon(BellOutlined);
export const BookOpen = icon(BookOutlined);
export const Box = icon(BuildOutlined);
export const Building2 = icon(ApartmentOutlined);
export const CalendarCheck2 = icon(CalendarOutlined);
export const Check = icon(CheckOutlined);
export const CheckCircle2 = icon(CheckCircleOutlined);
export const ChevronDown = icon(DownOutlined);
export const ChevronLeft = icon(LeftOutlined);
export const ChevronRight = icon(RightOutlined);
export const ChevronUp = icon(UpOutlined);
export const ClipboardList = icon(SolutionOutlined);
export const Clock3 = icon(ClockCircleOutlined);
export const CornerUpLeft = icon(RollbackOutlined);
export const Database = icon(DatabaseOutlined);
export const Download = icon(DownloadOutlined);
export const Ellipsis = icon(EllipsisOutlined);
export const ExternalLink = icon(ExportOutlined);
export const FileOutput = icon(ExportOutlined);
export const FileSearch = icon(FileSearchOutlined);
export const FileText = icon(FileTextOutlined);
export const Filter = icon(FilterOutlined);
export const FolderClock = icon(HistoryOutlined);
export const FolderKanban = icon(FolderOpenOutlined);
export const GitBranch = icon(BranchesOutlined);
export const GitPullRequest = icon(BranchesOutlined);
export const Globe = icon(GlobalOutlined);
export const HardDrive = icon(HddOutlined);
export const HelpCircle = icon(QuestionCircleOutlined);
export const History = icon(HistoryOutlined);
export const Layers = icon(CopyOutlined);
export const Layers3 = icon(CopyOutlined);
export const LayoutDashboard = icon(DashboardOutlined);
export const LayoutGrid = icon(AppstoreOutlined);
export const List = icon(UnorderedListOutlined);
export const ListChecks = icon(FileDoneOutlined);
export const LoaderCircle = icon(LoadingOutlined);
export const LockKeyhole = icon(LockOutlined);
export const MessageSquare = icon(CommentOutlined);
export const MessageSquarePlus = icon(CommentOutlined);
export const Minus = icon(MinusOutlined);
export const MoreHorizontal = icon(EllipsisOutlined);
export const PanelLeftClose = icon(MenuFoldOutlined);
export const PanelLeftOpen = icon(MenuUnfoldOutlined);
export const Pencil = icon(EditOutlined);
export const PencilLine = icon(EditOutlined);
export const Plus = icon(PlusOutlined);
export const RefreshCw = icon(ReloadOutlined);
export const RotateCcw = icon(RedoOutlined);
export const Save = icon(SaveOutlined);
export const Search = icon(SearchOutlined);
export const Send = icon(SendOutlined);
export const Server = icon(HddOutlined);
export const Settings = icon(SettingOutlined);
export const Settings2 = icon(SettingOutlined);
export const ShieldCheck = icon(SafetyCertificateOutlined);
export const SlidersHorizontal = icon(ControlOutlined);
export const Sparkles = icon(ThunderboltOutlined);
export const Timer = icon(ClockCircleOutlined);
export const Trash2 = icon(DeleteOutlined);
export const TrendingDown = icon(FallOutlined);
export const TrendingUp = icon(RiseOutlined);
export const Upload = icon(CloudUploadOutlined);
export const UserRoundCog = icon(UserSwitchOutlined);
export const Users = icon(TeamOutlined);
export const Workflow = icon(ApartmentOutlined);
export const X = icon(CloseOutlined);
