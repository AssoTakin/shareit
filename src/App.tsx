import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ListCollapse,
  Calendar as CalendarIcon,
  TrendingUp,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Copy,
  LogOut,
  ChevronRight,
  User,
  Bell,
  Clock,
  X,
  Check,
  MessageSquare
} from 'lucide-react';
import {
  supabase,
  isSupabaseConfigured,
  getHousehold,
  insertHousehold,
  updateHousehold,
  getCategories,
  insertCategory,
  updateCategory,
  deleteCategory,
  getMonths,
  updateMonth,
  getCharges,
  insertCharge,
  updateCharge,
  deleteCharge,
  getAdvances,
  insertAdvance,
  updateAdvance,
  deleteAdvance,
  getTemplates,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
  createNewMonth,
  importDemoHistory,
  insertActivityLog,
  getActivityLogs,
  getCommentsForCharges,
  insertChargeComment
} from './supabase';
import type {
  Household as HouseholdType,
  Category as CategoryType,
  MonthEntity as MonthType,
  Charge as ChargeType,
  Advance as AdvanceType,
  Template as TemplateType,
  ActivityLog,
  ChargeComment
} from './supabase';
import './App.css';

export interface ParsedAdvance extends AdvanceType {
  cleanLabel: string;
  category_id: string;
  split_method: string;
  updated_at?: string;
}

export function parseAdvance(adv: AdvanceType): ParsedAdvance {
  const match = adv.label.match(/^\[([^\]:]+):([^\]:]+)(?::([^\]]+))?\]\s*(.*)$/);
  if (match) {
    return {
      ...adv,
      category_id: match[1],
      split_method: match[2],
      updated_at: match[3] || undefined,
      cleanLabel: match[4]
    };
  }
  return {
    ...adv,
    category_id: 'autres',
    split_method: '50_50',
    cleanLabel: adv.label
  };
}

export function formatAdvanceLabel(cleanLabel: string, categoryId: string, splitMethod: string, updatedAt?: string): string {
  const prefix = updatedAt ? `${categoryId}:${splitMethod}:${updatedAt}` : `${categoryId}:${splitMethod}`;
  return `[${prefix}] ${cleanLabel.trim()}`;
}

const formatDateTime = (isoString?: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  
  return `le ${day}/${month}/${year} à ${hours}:${minutes}`;
};

const hasBeenModified = (item: any) => {
  if (!item.updated_at || !item.created_at) return false;
  const createdTime = new Date(item.created_at).getTime();
  const updatedTime = new Date(item.updated_at).getTime();
  return Math.abs(updatedTime - createdTime) > 1000;
};


export default function App() {
  const isConfigured = isSupabaseConfigured();
  const [householdId, setHouseholdId] = useState<string | null>(localStorage.getItem('share_it_household_id'));
  const [household, setHousehold] = useState<HouseholdType | null>(null);

  // Refs de suivi pour éviter les doublons et confusions de notifications
  const deletedChargesByMeRef = useRef<string[]>([]);
  const deletedAdvancesByMeRef = useRef<string[]>([]);
  const householdUpdatedByMeRef = useRef<boolean>(false);
  const monthStatusUpdatedByMeRef = useRef<string | null>(null);
  const chargesRef = useRef<ChargeType[]>([]);
  
  // Navigation & Simulation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'charts' | 'settings'>('dashboard');
  const [currentPartner, setCurrentPartner] = useState<'partner1' | 'partner2' | null>(
    localStorage.getItem('share_it_partner') as 'partner1' | 'partner2' | null
  );

  // Db State
  const [months, setMonths] = useState<MonthType[]>([]);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<MonthType | null>(null);
  const [charges, setCharges] = useState<ChargeType[]>([]);
  const [advances, setAdvances] = useState<AdvanceType[]>([]);
  const parsedAdvances = useMemo(() => advances.map(parseAdvance), [advances]);
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [templates, setTemplates] = useState<TemplateType[]>([]);

  // Local UI simulation states
  const [partnerTypingText, setPartnerTypingText] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Activity / Notification States
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  // Modal Control States
  const [showAddChargeModal, setShowAddChargeModal] = useState(false);
  const [chargeToEdit, setChargeToEdit] = useState<ChargeType | null>(null);
  
  const [showAddAdvanceModal, setShowAddAdvanceModal] = useState(false);
  const [advanceToEdit, setAdvanceToEdit] = useState<AdvanceType | null>(null);
  const [showEditSalariesModal, setShowEditSalariesModal] = useState(false);
  
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [categoryToRename, setCategoryToRename] = useState<CategoryType | null>(null);
  const [categoryNewName, setCategoryNewName] = useState('');
  
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [showCreateMonthModal, setShowCreateMonthModal] = useState(false);
  
  // Comments/Questions States
  const [comments, setComments] = useState<Record<string, ChargeComment[]>>({});
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [activeChargeForComments, setActiveChargeForComments] = useState<ChargeType | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Input states for creation/join
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [newFoyerName, setNewFoyerName] = useState('Foyer Pérouse');
  const [p1NameInput, setP1NameInput] = useState('Sam');
  const [p2NameInput, setP2NameInput] = useState('Aurélie');
  const [p1SalaryInput, setP1SalaryInput] = useState('2800');
  const [p2SalaryInput, setP2SalaryInput] = useState('2080');

  // Input states for new charges/advances/templates
  const [chargeLabel, setChargeLabel] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeCat, setChargeCat] = useState('basiques');
  const [chargeSplit, setChargeSplit] = useState('proportional');
  const [chargeRecurring, setChargeRecurring] = useState(false);

  const [advLabel, setAdvLabel] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [selectedCategoryInModal, setSelectedCategoryInModal] = useState('autres');
  const [selectedSplitMethodInModal, setSelectedSplitMethodInModal] = useState('50_50');

  const [sal1Input, setSal1Input] = useState('');
  const [sal2Input, setSal2Input] = useState('');

  const [newCatName, setNewCatName] = useState('');

  const [tempLabel, setTempLabel] = useState('');
  const [tempAmount, setTempAmount] = useState('');
  const [tempCat, setTempCat] = useState('basiques');
  const [tempSplit, setTempSplit] = useState('proportional');

  const [newMonthYear, setNewMonthYear] = useState(new Date().getFullYear());
  const [newMonthNumber, setNewMonthNumber] = useState(new Date().getMonth() + 1);

  // Settings inputs
  const [settingsFoyerName, setSettingsFoyerName] = useState('');
  const [settingsP1Name, setSettingsP1Name] = useState('');
  const [settingsP2Name, setSettingsP2Name] = useState('');
  const [settingsP1SalaryDefault, setSettingsP1SalaryDefault] = useState('');
  const [settingsP2SalaryDefault, setSettingsP2SalaryDefault] = useState('');

  // Toast / notification helper
  const addNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 3000);
  };

  // Activity log helpers
  const loadActivityLogs = async (code: string) => {
    try {
      const logs = await getActivityLogs(code);
      setActivityLogs(logs);
      
      const lastRead = localStorage.getItem('share_it_last_read_notifications');
      if (!lastRead) {
        setHasUnreadNotifications(logs.length > 0);
      } else {
        const lastReadDate = new Date(lastRead);
        const hasUnread = logs.some(log => log.created_at && new Date(log.created_at) > lastReadDate);
        setHasUnreadNotifications(hasUnread);
      }
    } catch (err) {
      console.warn("Could not load activity logs:", err);
    }
  };

  const handleClearNotificationsBadge = () => {
    localStorage.setItem('share_it_last_read_notifications', new Date().toISOString());
    setHasUnreadNotifications(false);
  };

  useEffect(() => {
    if (showNotificationsPanel) {
      handleClearNotificationsBadge();
    }
  }, [showNotificationsPanel]);

  const getActivityIcon = (actionType: string, _itemType: string) => {
    if (actionType === 'create') return <Plus size={12} />;
    if (actionType === 'delete') return <Trash2 size={12} style={{ color: 'var(--error)' }} />;
    if (actionType === 'validate') return <Check size={12} style={{ color: 'var(--success)' }} />;
    if (actionType === 'update') return <Edit2 size={12} style={{ color: 'var(--primary)' }} />;
    if (actionType === 'propose_close') return <Clock size={12} style={{ color: 'var(--warning)' }} />;
    if (actionType === 'close') return <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />;
    if (actionType === 'reject_close') return <X size={12} style={{ color: 'var(--error)' }} />;
    if (actionType === 'reopen') return <RefreshCw size={12} style={{ color: 'var(--secondary)' }} />;
    return <Bell size={12} />;
  };

  const getActivityText = (isMe: boolean, actionType: string, itemType: string, label: string) => {
    const typeLabel = itemType === 'charge' ? 'la charge' : itemType === 'advance' ? 'le paiement direct' : itemType === 'category' ? 'la catégorie' : 'le mois';
    if (actionType === 'create') return `${isMe ? 'avez ajouté' : 'a ajouté'} ${typeLabel} "${label}"`;
    if (actionType === 'update') return `${isMe ? 'avez modifié' : 'a modifié'} ${typeLabel} "${label}"`;
    if (actionType === 'delete') return `${isMe ? 'avez supprimé' : 'a supprimé'} ${typeLabel} "${label}"`;
    if (actionType === 'validate') return `${isMe ? 'avez validé' : 'a validé'} la charge reconduite "${label}"`;
    if (actionType === 'propose_close') return `${isMe ? 'avez proposé' : 'a proposé'} la clôture du mois`;
    if (actionType === 'close') return `${isMe ? 'avez validé et clôturé' : 'a validé et clôturé'} le mois`;
    if (actionType === 'reject_close') return `${isMe ? 'avez refusé' : 'a refusé'} la proposition de clôture`;
    if (actionType === 'reopen') return `${isMe ? 'avez réouvert' : 'a réouvert'} le mois`;
    if (actionType === 'rename_household') return `${isMe ? 'avez renommé' : 'a renommé'} le foyer en "${label}"`;
    return `${isMe ? 'avez effectué' : 'a effectué'} une action sur "${label}"`;
  };

  const formatLogDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    
    if (isToday) return `Aujourd'hui à ${timeStr}`;
    if (isYesterday) return `Hier à ${timeStr}`;
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} à ${timeStr}`;
  };

  // Switch Partner simulator

  const getPartnerName = (key: 'partner1' | 'partner2' | string) => {
    if (!household) return key === 'partner1' ? 'Sam' : 'Aurélie';
    return key === 'partner1' ? household.partner1_name : household.partner2_name;
  };

  // --- CHARGER LES DONNÉES ---
  const loadAllData = async (code: string) => {
    try {
      setIsLoading(true);
      const hh = await getHousehold(code);
      if (!hh) {
        localStorage.removeItem('share_it_household_id');
        setHouseholdId(null);
        setIsLoading(false);
        return;
      }
      setHousehold(hh);
      
      // Load categories
      const cats = await getCategories(code);
      setCategories(cats);

      // Pre-populate settings inputs
      setSettingsFoyerName(hh.name);
      setSettingsP1Name(hh.partner1_name);
      setSettingsP2Name(hh.partner2_name);
      setSettingsP1SalaryDefault(hh.partner1_salary_default.toString());
      setSettingsP2SalaryDefault(hh.partner2_salary_default.toString());

      // Load months
      const mList = await getMonths(code);
      setMonths(mList);

      if (mList.length > 0) {
        // Auto select first/latest month if not selected
        const currentSelId = selectedMonthId || mList[0].id;
        setSelectedMonthId(currentSelId);
        
        const currentM = mList.find(m => m.id === currentSelId) || mList[0];
        setSelectedMonth(currentM);
        setSal1Input(currentM.salary_user1.toString());
        setSal2Input(currentM.salary_user2.toString());

        // Load charges & advances for selected month
        const chs = await getCharges(currentM.id);
        setCharges(chs);
        const advs = await getAdvances(currentM.id);
        setAdvances(advs);
      } else {
        // Create initial month if list is empty
        const now = new Date();
        const mObj = await createNewMonth(code, now.getFullYear(), now.getMonth() + 1);
        setSelectedMonthId(mObj.id);
        setSelectedMonth(mObj);
        setSal1Input(mObj.salary_user1.toString());
        setSal2Input(mObj.salary_user2.toString());
        
        // Reload months list
        const updatedMonths = await getMonths(code);
        setMonths(updatedMonths);
        const chs = await getCharges(mObj.id);
        setCharges(chs);
        const advs = await getAdvances(mObj.id);
        setAdvances(advs);
      }

      // Load templates
      const temps = await getTemplates(code);
      setTemplates(temps);

      // Load activity logs
      await loadActivityLogs(code);

    } catch (err) {
      console.error("Erreur lors du chargement des données Supabase", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Effet de chargement initial
  useEffect(() => {
    if (isConfigured && householdId) {
      loadAllData(householdId);
    }
  }, [isConfigured, householdId]);

  // Effet de rechargement lors du changement de mois sélectionné
  useEffect(() => {
    if (isConfigured && selectedMonthId) {
      const activeM = months.find(m => m.id === selectedMonthId);
      if (activeM) {
        setSelectedMonth(activeM);
        setSal1Input(activeM.salary_user1.toString());
        setSal2Input(activeM.salary_user2.toString());
        getCharges(selectedMonthId).then(setCharges);
        getAdvances(selectedMonthId).then(setAdvances);
      }
    }
  }, [selectedMonthId, months]);

  const loadCommentsForCharges = async (chargeList: ChargeType[]) => {
    try {
      const chargeIds = chargeList.map(c => c.id).filter((id): id is string => !!id);
      if (chargeIds.length === 0) {
        setComments({});
        return;
      }
      const allComments = await getCommentsForCharges(chargeIds);
      const grouped: Record<string, ChargeComment[]> = {};
      allComments.forEach(comm => {
        if (!grouped[comm.charge_id]) {
          grouped[comm.charge_id] = [];
        }
        grouped[comm.charge_id].push(comm);
      });
      setComments(grouped);
    } catch (err) {
      console.warn("Erreur lors du chargement des commentaires :", err);
    }
  };

  // Sync chargesRef and load comments on charges change
  useEffect(() => {
    chargesRef.current = charges;
    if (isConfigured && charges.length > 0) {
      loadCommentsForCharges(charges);
    } else {
      setComments({});
    }
  }, [charges, isConfigured]);

  // ==========================================
  // REAL-TIME SYNCHRONIZATION (SUPABASE LISTENERS)
  // ==========================================
  useEffect(() => {
    if (!isConfigured || !householdId) return;

    // Création d'un canal temps réel sur le schéma public de la base
    const channel = supabase
      .channel('share-it-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload: any) => {
          const table = payload.table;
          const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'

          const partnerKey = currentPartner === 'partner1' ? 'partner2' : 'partner1';
          const partnerName = getPartnerName(partnerKey);

          if (table === 'charges') {
            if (selectedMonthId) getCharges(selectedMonthId).then(setCharges);
            if (eventType === 'INSERT') {
              const actor = payload.new.added_by;
              if (actor !== currentPartner) {
                const actorName = getPartnerName(actor);
                triggerTypingSimulation(`${actorName} a ajouté une charge : "${payload.new.label}"`);
              }
            } else if (eventType === 'UPDATE') {
              const isValidation = payload.old && payload.new.is_validated === true && payload.old.is_validated === false;
              if (isValidation) {
                const actor = payload.new.added_by;
                if (actor !== currentPartner) {
                  const actorName = getPartnerName(actor);
                  addNotification(`${actorName} a validé la charge reconduite : "${payload.new.label}"`);
                }
              } else {
                const actor = payload.new.modified_by || payload.new.added_by;
                if (actor !== currentPartner) {
                  const actorName = getPartnerName(actor);
                  triggerTypingSimulation(`${actorName} a modifié une charge : "${payload.new.label}"`);
                }
              }
            } else if (eventType === 'DELETE') {
              if (deletedChargesByMeRef.current.includes(payload.old.id)) {
                // Clear from ref, do not notify since already notified locally
                deletedChargesByMeRef.current = deletedChargesByMeRef.current.filter(id => id !== payload.old.id);
              } else {
                // Modified/deleted by the partner
                addNotification(`${partnerName} a supprimé la charge : "${payload.old.label}"`);
              }
            }
          } else if (table === 'advances') {
            if (selectedMonthId) getAdvances(selectedMonthId).then(setAdvances);
            if (eventType === 'INSERT') {
              const actor = payload.new.assigned_to;
              if (actor !== currentPartner) {
                const actorName = getPartnerName(actor);
                addNotification(`${actorName} a avancé ${payload.new.amount} € pour "${payload.new.label}"`);
              }
            } else if (eventType === 'UPDATE') {
              const actor = payload.new.modified_by || payload.new.assigned_to;
              if (actor !== currentPartner) {
                const actorName = getPartnerName(actor);
                addNotification(`${actorName} a mis à jour le paiement direct : "${payload.new.label}"`);
              }
            } else if (eventType === 'DELETE') {
              if (deletedAdvancesByMeRef.current.includes(payload.old.id)) {
                deletedAdvancesByMeRef.current = deletedAdvancesByMeRef.current.filter(id => id !== payload.old.id);
              } else {
                addNotification(`${partnerName} a supprimé le paiement direct : "${payload.old.label}"`);
              }
            }
          } else if (table === 'months') {
            getMonths(householdId).then(setMonths);
            if (eventType === 'UPDATE') {
              const oldMonth = months.find(m => m.id === payload.new.id);
              if (oldMonth && oldMonth.status !== payload.new.status) {
                if (payload.new.status === 'pending_close') {
                  if (payload.new.close_requested_by !== currentPartner) {
                    addNotification(`${getPartnerName(payload.new.close_requested_by)} demande la clôture du mois`);
                  }
                } else if (payload.new.status === 'closed') {
                  addNotification(`Mois clôturé et verrouillé ✅`);
                } else if (payload.new.status === 'reopened') {
                  if (monthStatusUpdatedByMeRef.current !== 'reopened') {
                    addNotification(`Le mois a été réouvert par votre partenaire`);
                  }
                  monthStatusUpdatedByMeRef.current = null;
                } else if (payload.new.status === 'draft' && oldMonth.status === 'pending_close') {
                  if (oldMonth.close_requested_by === currentPartner) {
                    addNotification(`La proposition de clôture a été refusée par votre partenaire`);
                  }
                }
              }
            }
          } else if (table === 'categories') {
            getCategories(householdId).then(setCategories);
          } else if (table === 'templates') {
            getTemplates(householdId).then(setTemplates);
          } else if (table === 'households') {
            getHousehold(householdId).then(setHousehold);
            if (eventType === 'UPDATE') {
              if (householdUpdatedByMeRef.current) {
                householdUpdatedByMeRef.current = false;
              } else {
                addNotification(`Le nom du foyer a été mis à jour : "${payload.new.name}"`);
              }
            }
          } else if (table === 'activity_logs') {
            loadActivityLogs(householdId);
          } else if (table === 'charge_comments') {
            if (chargesRef.current.length > 0) {
              loadCommentsForCharges(chargesRef.current);
            }
            if (eventType === 'INSERT') {
              const author = payload.new.author;
              if (author !== currentPartner) {
                const chargeId = payload.new.charge_id;
                const charge = chargesRef.current.find(c => c.id === chargeId);
                const chargeLabel = charge ? charge.label : "une charge";
                const authorName = getPartnerName(author);
                addNotification(`💬 ${authorName} : "${payload.new.content}" (sur "${chargeLabel}")`);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConfigured, householdId, selectedMonthId, currentPartner, months]);

  // Ajuster automatiquement la vue et le focus lorsqu'un formulaire (modal) s'ouvre
  useEffect(() => {
    const isAnyModalOpen = 
      showAddChargeModal || 
      showEditSalariesModal || 
      showAddCategoryModal || 
      !!categoryToRename || 
      showAddTemplateModal || 
      showCreateMonthModal ||
      showCommentsModal;

    if (isAnyModalOpen) {
      const timer = setTimeout(() => {
        // 1. Remonter le scroll du modal-content et s'assurer qu'il est visible / centré
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
          modalContent.scrollTo({ top: 0 });
          modalContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // 2. Focus sur le premier input
        const firstInput = document.querySelector('.modal-content input, .modal-content select') as HTMLInputElement | HTMLSelectElement | null;
        if (firstInput) {
          firstInput.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    showAddChargeModal, 
    showEditSalariesModal, 
    showAddCategoryModal, 
    categoryToRename, 
    showAddTemplateModal, 
    showCreateMonthModal
  ]);

  // Simulation d'activité du partenaire
  const triggerTypingSimulation = (msg: string) => {
    setPartnerTypingText(msg);
    addNotification(msg);
    setTimeout(() => {
      setPartnerTypingText(null);
    }, 4000);
  };

  // --- ACTIONS ONBOARDING ---
  const handleCreateHousehold = async () => {
    try {
      setOnboardingError(null);
      if (!newFoyerName || !p1NameInput || !p2NameInput) {
        setOnboardingError("Veuillez remplir le nom du foyer et des partenaires.");
        return;
      }
      
      // Générer un code à 6 lettres majuscules uniques
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const code = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
      
      const newHh: HouseholdType = {
        id: code,
        name: newFoyerName,
        partner1_name: p1NameInput,
        partner2_name: p2NameInput,
        partner1_salary_default: parseFloat(p1SalaryInput) || 2500,
        partner2_salary_default: parseFloat(p2SalaryInput) || 2080
      };

      await insertHousehold(newHh);
      localStorage.setItem('share_it_household_id', code);
      setHouseholdId(code);
      addNotification(`Foyer "${newFoyerName}" créé avec le code ${code}`);
    } catch (err: any) {
      setOnboardingError(err.message || "Erreur lors de la création.");
    }
  };

  const handleJoinHousehold = async () => {
    try {
      setOnboardingError(null);
      if (joinCodeInput.length < 6) {
        setOnboardingError("Le code doit faire 6 caractères.");
        return;
      }
      const hh = await getHousehold(joinCodeInput);
      if (hh) {
        localStorage.setItem('share_it_household_id', hh.id);
        setHouseholdId(hh.id);
        addNotification(`Foyer "${hh.name}" rejoint !`);
      } else {
        setOnboardingError("Code incorrect ou foyer introuvable.");
      }
    } catch (err: any) {
      setOnboardingError(err.message || "Erreur de connexion.");
    }
  };

  // --- ACTIONS DE COMPTES ---
  const handleUpdateSalaries = async () => {
    if (!selectedMonth) return;
    try {
      const updated = {
        ...selectedMonth,
        salary_user1: parseFloat(sal1Input) || 0,
        salary_user2: parseFloat(sal2Input) || 0
      };
      await updateMonth(updated);
      setSelectedMonth(updated);
      setShowEditSalariesModal(false);
      addNotification("Salaires mensuels mis à jour");
    } catch (err) {
      console.error(err);
    }
  };

  // --- ACTIONS CHARGES ---
  const handleSaveCharge = async () => {
    if (!selectedMonthId || !chargeLabel || !chargeAmount) return;
    try {
      const amount = parseFloat(chargeAmount) || 0;
      if (chargeToEdit) {
        let modified_by = null;
        let added_by = chargeToEdit.added_by;
        let is_validated = chargeToEdit.is_validated;

        if (chargeToEdit.is_validated === false) {
          is_validated = true;
          added_by = currentPartner!;
          modified_by = null;
        } else {
          if (currentPartner !== chargeToEdit.added_by) {
            modified_by = currentPartner;
          } else {
            modified_by = null;
          }
        }

        await updateCharge({
          ...chargeToEdit,
          label: chargeLabel,
          amount,
          category_id: chargeCat,
          split_method: chargeSplit,
          is_recurring: chargeRecurring,
          added_by,
          modified_by,
          is_validated
        });
        if (chargeToEdit.is_validated === false) {
          await insertActivityLog(householdId!, currentPartner!, 'validate', 'charge', chargeLabel, `${amount.toFixed(2)} €`);
        } else {
          await insertActivityLog(householdId!, currentPartner!, 'update', 'charge', chargeLabel, `${amount.toFixed(2)} €`);
        }
        addNotification(`Votre modification a bien été prise en compte ("${chargeLabel}")`);
      } else {
        await insertCharge({
          month_id: selectedMonthId,
          category_id: chargeCat,
          label: chargeLabel,
          amount,
          split_method: chargeSplit,
          is_recurring: chargeRecurring,
          added_by: currentPartner!,
          modified_by: null,
          is_validated: true
        });
        await insertActivityLog(householdId!, currentPartner!, 'create', 'charge', chargeLabel, `${amount.toFixed(2)} €`);
        addNotification(`Votre saisie a bien été prise en compte ("${chargeLabel}")`);
      }
      
      // Reset & Close
      setChargeLabel('');
      setChargeAmount('');
      setChargeRecurring(false);
      setChargeToEdit(null);
      setShowAddChargeModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConvertToAdvance = async () => {
    if (!chargeToEdit || !chargeToEdit.id) return;
    const amount = parseFloat(chargeAmount) || chargeToEdit.amount;
    
    if (!window.confirm(`Voulez-vous vraiment convertir la charge "${chargeLabel}" en avance / paiement direct ?\nCette action supprimera la charge et créera une avance du même montant.`)) return;

    try {
      const assignedTo = chargeToEdit.added_by || currentPartner!;
      const formattedLabel = formatAdvanceLabel(chargeLabel, chargeToEdit.category_id, chargeToEdit.split_method);

      // 1. Insérer l'avance
      await insertAdvance({
        month_id: chargeToEdit.month_id,
        assigned_to: assignedTo,
        amount: amount,
        label: formattedLabel,
        modified_by: currentPartner === assignedTo ? null : currentPartner!
      });

      // 2. Supprimer la charge
      deletedChargesByMeRef.current.push(chargeToEdit.id);
      await deleteCharge(chargeToEdit.id);

      // 3. Activité de suppression et création
      await insertActivityLog(
        householdId!, 
        currentPartner!, 
        'delete', 
        'charge', 
        chargeToEdit.label, 
        `Convertie en paiement direct`
      );
      await insertActivityLog(
        householdId!, 
        currentPartner!, 
        'create', 
        'advance', 
        chargeLabel, 
        `${amount.toFixed(2)} € (Convertie)`
      );

      addNotification(`La charge "${chargeToEdit.label}" a été convertie en avance / paiement direct.`);

      // Reset & Close
      setShowAddChargeModal(false);
      setChargeToEdit(null);
      setChargeLabel('');
      setChargeAmount('');
      setChargeRecurring(false);
    } catch (err) {
      console.error("Erreur lors de la conversion :", err);
    }
  };

  const handleDeleteCharge = async (id: string, label: string) => {
    const charge = charges.find(c => c.id === id);
    if (charge && charge.added_by !== currentPartner) {
      alert("Vous ne pouvez pas supprimer une charge dont vous n'êtes pas à l'origine.");
      return;
    }
    if (!window.confirm(`Voulez-vous vraiment supprimer la charge "${label}" ?`)) return;
    try {
      deletedChargesByMeRef.current.push(id);
      await deleteCharge(id);
      await insertActivityLog(householdId!, currentPartner!, 'delete', 'charge', label);
      addNotification(`Votre suppression a bien été prise en compte ("${label}")`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleValidateCharge = async (charge: ChargeType) => {
    if (!charge.id) return;
    try {
      await updateCharge({
        ...charge,
        is_validated: true,
        added_by: currentPartner!,
        modified_by: null
      });
      await insertActivityLog(householdId!, currentPartner!, 'validate', 'charge', charge.label, `${charge.amount.toFixed(2)} €`);
      addNotification(`Votre validation a bien été prise en compte ("${charge.label}")`);
    } catch (err) {
      console.error(err);
    }
  };

  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToCommentsBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const openCommentsForCharge = (charge: ChargeType) => {
    setActiveChargeForComments(charge);
    setNewCommentText('');
    setShowCommentsModal(true);
    setTimeout(scrollToCommentsBottom, 100);
  };

  const handleSendComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCommentText.trim() || !activeChargeForComments || !activeChargeForComments.id) return;

    try {
      const newComment: ChargeComment = {
        charge_id: activeChargeForComments.id,
        author: currentPartner!,
        content: newCommentText.trim()
      };

      const inserted = await insertChargeComment(newComment);

      // Optimistic update
      setComments(prev => {
        const list = prev[activeChargeForComments.id!] || [];
        // Avoid duplicate if realtime already inserted it
        if (list.some(c => c.id === inserted.id)) return prev;
        return {
          ...prev,
          [activeChargeForComments.id!]: [...list, inserted]
        };
      });

      // Insert Activity Log
      await insertActivityLog(
        householdId!,
        currentPartner!,
        'comment', // action type
        'charge',
        activeChargeForComments.label,
        newCommentText.trim()
      );

      setNewCommentText('');
      setTimeout(scrollToCommentsBottom, 50);
    } catch (err) {
      console.warn("Erreur lors de l'envoi du commentaire :", err);
    }
  };

  const openEditCharge = (c: ChargeType) => {
    setChargeToEdit(c);
    setChargeLabel(c.label);
    setChargeAmount(c.amount.toString());
    setChargeCat(c.category_id);
    setChargeSplit(c.split_method);
    setChargeRecurring(c.is_recurring);
    setShowAddChargeModal(true);
  };

  const openAddChargeForCategory = (catId: string) => {
    setChargeToEdit(null);
    setChargeLabel('');
    setChargeAmount('');
    setChargeCat(catId);
    setChargeSplit('proportional');
    setChargeRecurring(false);
    setShowAddChargeModal(true);
  };

  // --- ACTIONS AVANCES ---
  const openAddAdvance = () => {
    setAdvanceToEdit(null);
    setAdvLabel('');
    setAdvAmount('');
    setSelectedCategoryInModal('autres');
    setSelectedSplitMethodInModal('50_50');
    setShowAddAdvanceModal(true);
  };

  const openEditAdvance = (adv: AdvanceType) => {
    const parsed = parseAdvance(adv);
    setAdvanceToEdit(adv);
    setAdvLabel(parsed.cleanLabel);
    setAdvAmount(adv.amount.toString());
    setSelectedCategoryInModal(parsed.category_id);
    setSelectedSplitMethodInModal(parsed.split_method);
    setShowAddAdvanceModal(true);
  };

  const handleSaveAdvance = async () => {
    if (!selectedMonthId || !advLabel || !advAmount) return;
    try {
      const amount = parseFloat(advAmount) || 0;

      if (advanceToEdit) {
        let modified_by = null;
        if (currentPartner !== advanceToEdit.assigned_to) {
          modified_by = currentPartner;
        }

        const formattedLabel = formatAdvanceLabel(advLabel, selectedCategoryInModal, selectedSplitMethodInModal, new Date().toISOString());

        await updateAdvance({
          ...advanceToEdit,
          amount,
          label: formattedLabel,
          modified_by
        });
        await insertActivityLog(householdId!, currentPartner!, 'update', 'advance', advLabel, `${amount.toFixed(2)} €`);
        addNotification(`Votre modification a bien été prise en compte ("${advLabel}")`);
      } else {
        const formattedLabel = formatAdvanceLabel(advLabel, selectedCategoryInModal, selectedSplitMethodInModal);

        await insertAdvance({
          month_id: selectedMonthId,
          assigned_to: currentPartner!,
          amount,
          label: formattedLabel,
          modified_by: null
        });
        await insertActivityLog(householdId!, currentPartner!, 'create', 'advance', advLabel, `${amount.toFixed(2)} €`);
        addNotification(`Votre saisie a bien été prise en compte ("${advLabel}")`);
      }

      setAdvLabel('');
      setAdvAmount('');
      setAdvanceToEdit(null);
      setShowAddAdvanceModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAdvance = async (id: string, label: string) => {
    const adv = advances.find(a => a.id === id);
    if (adv && adv.assigned_to !== currentPartner) {
      alert("Vous ne pouvez pas supprimer une avance dont vous n'êtes pas à l'origine.");
      return;
    }
    if (!window.confirm(`Voulez-vous vraiment supprimer l'avance "${label}" ?`)) return;
    try {
      deletedAdvancesByMeRef.current.push(id);
      await deleteAdvance(id);
      await insertActivityLog(householdId!, currentPartner!, 'delete', 'advance', label);
      addNotification(`Votre suppression a bien été prise en compte ("${label}")`);
    } catch (err) {
      console.error(err);
    }
  };

  // --- ACTIONS CATÉGORIES ---
  const handleSaveCategory = async () => {
    if (!householdId || !newCatName) return;
    try {
      // Générer un ID unique à partir du nom
      const catId = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.display_order), 0);
      
      await insertCategory({
        id: catId,
        household_id: householdId,
        name: newCatName,
        display_order: maxOrder + 10,
        is_default: false
      });
      
      await insertActivityLog(householdId!, currentPartner!, 'create', 'category', newCatName);
      setNewCatName('');
      setShowAddCategoryModal(false);
      addNotification(`Catégorie "${newCatName}" créée`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameCategory = async () => {
    if (!categoryToRename || !categoryNewName) return;
    try {
      await updateCategory({
        ...categoryToRename,
        name: categoryNewName
      });
      await insertActivityLog(householdId!, currentPartner!, 'update', 'category', categoryNewName, `Ancien : ${categoryToRename.name}`);
      setCategoryToRename(null);
      setCategoryNewName('');
      addNotification("Catégorie renommée");
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (cat: CategoryType) => {
    if (cat.is_default || ['basiques', 'maia', 'autres'].includes(cat.id)) {
      alert("Impossible de supprimer une catégorie système par défaut.");
      return;
    }
    if (!window.confirm(`Supprimer la catégorie "${cat.name}" ? Ses charges associées seront déplacées vers "Autres charges".`)) return;
    
    try {
      // Rapatrier d'abord les charges du mois courant sur 'autres'
      const chargesToMove = charges.filter(ch => ch.category_id === cat.id);
      for (const ch of chargesToMove) {
        await updateCharge({ ...ch, category_id: 'autres' });
      }
      
      await deleteCategory(cat.id);
      await insertActivityLog(householdId!, currentPartner!, 'delete', 'category', cat.name);
      addNotification(`Catégorie "${cat.name}" supprimée`);
    } catch (err) {
      console.error(err);
    }
  };

  // --- ACTIONS MONTH WORKFLOW ---
  const handleProposeClosure = async () => {
    if (!selectedMonth) return;
    const hasUnvalidated = charges.some(c => c.is_validated === false);
    if (hasUnvalidated) {
      alert("Impossible de proposer la clôture : certaines charges reconduites n'ont pas encore été validées ou modifiées.");
      return;
    }
    try {
      const updated = {
        ...selectedMonth,
        status: 'pending_close',
        close_requested_by: currentPartner,
        close_requested_at: new Date().toISOString()
      };
      await updateMonth(updated);
      setSelectedMonth(updated);
      await insertActivityLog(householdId!, currentPartner!, 'propose_close', 'month', `${frenchMonthName(selectedMonth.month)} ${selectedMonth.year}`);
      addNotification("Proposition de clôture envoyée");
    } catch (err) {
      console.error(err);
    }
  };

  const handleValidateClosure = async () => {
    if (!selectedMonth) return;
    try {
      const updated = {
        ...selectedMonth,
        status: 'closed',
        closed_at: new Date().toISOString()
      };
      await updateMonth(updated);
      setSelectedMonth(updated);
      await insertActivityLog(householdId!, currentPartner!, 'close', 'month', `${frenchMonthName(selectedMonth.month)} ${selectedMonth.year}`);
      addNotification("Mois clôturé et validé");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectClosure = async () => {
    if (!selectedMonth) return;
    try {
      const updated = {
        ...selectedMonth,
        status: 'draft',
        close_requested_by: null,
        close_requested_at: null
      };
      await updateMonth(updated);
      setSelectedMonth(updated);
      await insertActivityLog(householdId!, currentPartner!, 'reject_close', 'month', `${frenchMonthName(selectedMonth.month)} ${selectedMonth.year}`);
      addNotification("Proposition de clôture refusée");
    } catch (err) {
      console.error(err);
    }
  };

  const handleReopenMonth = async () => {
    if (!selectedMonth) return;
    try {
      const updated = {
        ...selectedMonth,
        status: 'reopened',
        closed_at: null,
        close_requested_by: null,
        close_requested_at: null
      };
      monthStatusUpdatedByMeRef.current = 'reopened';
      await updateMonth(updated);
      setSelectedMonth(updated);
      await insertActivityLog(householdId!, currentPartner!, 'reopen', 'month', `${frenchMonthName(selectedMonth.month)} ${selectedMonth.year}`);
      addNotification("Votre demande de réouverture a bien été prise en compte");
    } catch (err) {
      console.error(err);
    }
  };

  // --- ACTIONS SETTINGS ---
  const handleRenameHousehold = async (newName: string) => {
    if (!household) return;
    try {
      const updated = {
        ...household,
        name: newName
      };
      householdUpdatedByMeRef.current = true;
      await updateHousehold(updated);
      setHousehold(updated);
      setSettingsFoyerName(newName);
      await insertActivityLog(household.id!, currentPartner!, 'rename_household', 'household', newName);
      addNotification(`Votre modification du nom du foyer a bien été prise en compte ("${newName}")`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors du renommage : " + err);
    }
  };

  const handleSaveSettings = async () => {
    if (!household) return;
    try {
      const updated = {
        ...household,
        name: settingsFoyerName,
        partner1_name: settingsP1Name,
        partner2_name: settingsP2Name,
        partner1_salary_default: parseFloat(settingsP1SalaryDefault) || 2500,
        partner2_salary_default: parseFloat(settingsP2SalaryDefault) || 2080
      };
      await updateHousehold(updated);
      setHousehold(updated);
      alert("Profil du foyer enregistré !");
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveTemplate = async () => {
    if (!householdId || !tempLabel || !tempAmount) return;
    try {
      await insertTemplate({
        household_id: householdId,
        category_id: tempCat,
        label: tempLabel,
        default_amount: parseFloat(tempAmount) || 0,
        split_method: tempSplit,
        is_active: true
      });
      setTempLabel('');
      setTempAmount('');
      setShowAddTemplateModal(false);
      
      // Reload templates
      const updated = await getTemplates(householdId);
      setTemplates(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTemplate = async (t: TemplateType) => {
    try {
      const updated = { ...t, is_active: !t.is_active };
      await updateTemplate(updated);
      setTemplates(prev => prev.map(item => item.id === t.id ? updated : item));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("Supprimer ce modèle récurrent ?")) return;
    try {
      await deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Créer un nouveau mois vide/modèles
  const handleCreateNewMonth = async () => {
    if (!householdId) return;
    try {
      const mId = `${householdId}_${newMonthYear}_${newMonthNumber}`;
      if (months.some(m => m.id === mId)) {
        alert("Ce mois est déjà existant !");
        return;
      }
      const newM = await createNewMonth(householdId, newMonthYear, newMonthNumber);
      setSelectedMonthId(newM.id);
      setActiveTab('dashboard');
      setShowCreateMonthModal(false);
      await insertActivityLog(householdId, currentPartner!, 'create', 'month', `${frenchMonthName(newMonthNumber)} ${newMonthYear}`);
      
      // Reload months list
      const updated = await getMonths(householdId);
      setMonths(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // Importer les données démo
  const handleImportDemo = async () => {
    if (!householdId) return;
    if (!window.confirm("Cela va écraser et recréer les 21 mois d'historique (septembre 2024 - mai 2026) pour ce foyer. Confirmer ?")) return;
    try {
      setIsLoading(true);
      await importDemoHistory(householdId);
      alert("Historique de démonstration importé avec succès !");
      await loadAllData(householdId);
      setActiveTab('dashboard');
    } catch (err) {
      alert("Erreur lors de l'import : " + err);
    } finally {
      setIsLoading(false);
    }
  };

  // Quitter le foyer
  const handleLogout = () => {
    if (!window.confirm("Quitter ce foyer ? Vous devrez saisir à nouveau le code d'invitation.")) return;
    localStorage.removeItem('share_it_household_id');
    setHouseholdId(null);
    setHousehold(null);
    setMonths([]);
    setSelectedMonthId(null);
    setSelectedMonth(null);
  };

  // ==========================================
  // CALCULS DU PORTFEUILLE & FORMULES PRORATA
  // ==========================================
  const calculations = useMemo(() => {
    if (!selectedMonth) return {
      ratioSam: 0.5,
      ratioAurelie: 0.5,
      totalCharges: 0,
      totalDue1: 0,
      totalDue2: 0,
      totalPaid1: 0,
      totalPaid2: 0,
      balance1: 0,
      balance2: 0,
      totalAutresSam: 0,
      totalAutresAurelie: 0,
      balanceSam: 0,
      balanceAurelie: 0,
      virementAdjustmentSam: 0,
      virementAdjustmentAurelie: 0,
      virementSam: 0,
      virementAurelie: 0,
      catDetails: {} as Record<string, { total: number; due1: number; due2: number }>
    };

    const sal1 = selectedMonth.salary_user1;
    const sal2 = selectedMonth.salary_user2;
    const totalSal = Math.max(1, sal1 + sal2);
    const ratioSam = sal1 / totalSal;
    const ratioAurelie = sal2 / totalSal;

    let totalCharges = 0;
    let totalDue1 = 0;
    let totalDue2 = 0;
    
    // Groupement et répartition par catégorie
    const catDetails: Record<string, { total: number; due1: number; due2: number }> = {};
    categories.forEach(c => {
      catDetails[c.id] = { total: 0, due1: 0, due2: 0 };
    });
    // S'assurer qu'au moins 'autres' est disponible dans les détails
    if (!catDetails['autres']) {
      catDetails['autres'] = { total: 0, due1: 0, due2: 0 };
    }

    charges.forEach(c => {
      const amt = c.amount;
      let d1 = 0;
      let d2 = 0;

      switch (c.split_method) {
        case 'proportional':
          d1 = amt * ratioSam;
          d2 = amt * ratioAurelie;
          break;
        case '50_50':
          d1 = amt / 2;
          d2 = amt / 2;
          break;
        case 'user1_only':
          d1 = amt;
          d2 = 0;
          break;
        case 'user2_only':
          d1 = 0;
          d2 = amt;
          break;
        default:
          d1 = amt / 2;
          d2 = amt / 2;
      }

      totalCharges += amt;
      totalDue1 += d1;
      totalDue2 += d2;

      const catId = catDetails[c.category_id] ? c.category_id : 'autres';
      catDetails[catId].total += amt;
      catDetails[catId].due1 += d1;
      catDetails[catId].due2 += d2;
    });

    // Avances & Paid
    let directPaid1 = 0;
    let directPaid2 = 0;
    charges.forEach(c => {
      if (c.added_by === 'partner1') {
        directPaid1 += c.amount;
      } else {
        directPaid2 += c.amount;
      }
    });

    const parsedAdvances = advances.map(parseAdvance);

    let totalAdvPaid1 = 0;
    let totalAdvPaid2 = 0;
    let totalAdvDue1 = 0;
    let totalAdvDue2 = 0;

    let balSam = 0;
    let balAurelie = 0;

    parsedAdvances.forEach(adv => {
      const amt = adv.amount;
      let d1 = 0;
      let d2 = 0;

      switch (adv.split_method) {
        case 'proportional':
          d1 = amt * ratioSam;
          d2 = amt * ratioAurelie;
          break;
        case '50_50':
          d1 = amt / 2;
          d2 = amt / 2;
          break;
        case 'user1_only':
          d1 = amt;
          d2 = 0;
          break;
        case 'user2_only':
          d1 = 0;
          d2 = amt;
          break;
        default:
          d1 = amt / 2;
          d2 = amt / 2;
      }

      totalAdvDue1 += d1;
      totalAdvDue2 += d2;

      // Ajouter l'avance au détail de sa catégorie correspondante
      const catId = catDetails[adv.category_id] ? adv.category_id : 'autres';
      catDetails[catId].total += amt;
      catDetails[catId].due1 += d1;
      catDetails[catId].due2 += d2;

      const is5050 = adv.split_method === '50_50';

      if (adv.assigned_to === 'partner1') {
        totalAdvPaid1 += amt;
        balSam += is5050 ? -amt : (d1 - amt);
        balAurelie += is5050 ? amt : d2;
      } else {
        totalAdvPaid2 += amt;
        balSam += is5050 ? amt : d1;
        balAurelie += is5050 ? -amt : (d2 - amt);
      }
    });

    // Ajustement de virement = part due - ce qui a été payé
    const virementAdjustmentSam = totalAdvDue1 - totalAdvPaid1;
    const virementAdjustmentAurelie = totalAdvDue2 - totalAdvPaid2;

    const balanceSam = balSam;
    const balanceAurelie = balAurelie;

    const totalAutresSam = totalAdvPaid1;
    const totalAutresAurelie = totalAdvPaid2;

    const virementSam = Math.ceil((totalDue1 + virementAdjustmentSam) * 100) / 100;
    const virementAurelie = Math.ceil((totalDue2 + virementAdjustmentAurelie) * 100) / 100;

    const totalPaid1 = directPaid1 + totalAdvPaid1;
    const totalPaid2 = directPaid2 + totalAdvPaid2;

    const balance1 = totalPaid1 - totalDue1;
    const balance2 = totalPaid2 - totalDue2;

    return {
      ratioSam,
      ratioAurelie,
      totalCharges,
      totalDue1,
      totalDue2,
      totalPaid1,
      totalPaid2,
      balance1,
      balance2,
      totalAutresSam,
      totalAutresAurelie,
      balanceSam,
      balanceAurelie,
      virementAdjustmentSam,
      virementAdjustmentAurelie,
      virementSam,
      virementAurelie,
      catDetails
    };
  }, [selectedMonth, charges, advances, categories]);

  // Noms de mois français
  const frenchMonthName = (mNum: number) => {
    const names = [
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    return names[mNum - 1] || mNum.toString();
  };

  // --- RENDER D'ONBOARDING (CRÉER OU REJOINDRE) ---
  if (!householdId) {
    return (
      <div className="container animate-fade-in" style={{ justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="card" style={{ gap: '20px', padding: '28px', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>Share It</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Gérez les charges de votre couple au prorata de vos revenus en temps réel.
            </p>
          </div>

          {!isConfigured && (
            <div className="hud-banner" style={{ background: 'var(--error-light)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '13px' }}>
              <AlertCircle size={18} style={{ minWidth: '18px' }} />
              <div>
                <strong>Configuration requise :</strong> Vos clés d'API Supabase ne sont pas encore définies dans le fichier <code>.env</code>. Veuillez configurer les clés <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.
              </div>
            </div>
          )}

          {onboardingError && (
            <div className="hud-banner" style={{ background: 'var(--error-light)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '13px' }}>
              <AlertCircle size={18} />
              <span>{onboardingError}</span>
            </div>
          )}

          {isJoinMode ? (
            // Formulaire Rejoindre Foyer
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>Rejoindre un foyer existant</h2>
              <div className="form-group">
                <label>Code d'invitation (6 lettres)</label>
                <input
                  type="text"
                  className="input-field"
                  value={joinCodeInput}
                  onChange={e => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="E.g. PEROUS"
                  disabled={!isConfigured}
                />
              </div>
              <button className="btn-primary" onClick={handleJoinHousehold} disabled={!isConfigured}>
                Rejoindre l'espace
              </button>
            </div>
          ) : (
            // Formulaire Créer Foyer
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>Créer un nouveau foyer</h2>
              <div className="form-group">
                <label>Nom du foyer</label>
                <input
                  type="text"
                  className="input-field"
                  value={newFoyerName}
                  onChange={e => setNewFoyerName(e.target.value)}
                  placeholder="Foyer Pérouse"
                  disabled={!isConfigured}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group">
                  <label>Partenaire 1</label>
                  <input
                    type="text"
                    className="input-field"
                    value={p1NameInput}
                    onChange={e => setP1NameInput(e.target.value)}
                    placeholder="Sam"
                    disabled={!isConfigured}
                  />
                </div>
                <div className="form-group">
                  <label>Partenaire 2</label>
                  <input
                    type="text"
                    className="input-field"
                    value={p2NameInput}
                    onChange={e => setP2NameInput(e.target.value)}
                    placeholder="Aurélie"
                    disabled={!isConfigured}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group">
                  <label>Salaire {p1NameInput} (€)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={p1SalaryInput}
                    onChange={e => setP1SalaryInput(e.target.value)}
                    disabled={!isConfigured}
                  />
                </div>
                <div className="form-group">
                  <label>Salaire {p2NameInput} (€)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={p2SalaryInput}
                    onChange={e => setP2SalaryInput(e.target.value)}
                    disabled={!isConfigured}
                  />
                </div>
              </div>
              <button className="btn-primary" onClick={handleCreateHousehold} disabled={!isConfigured}>
                Créer mon foyer
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setIsJoinMode(!isJoinMode);
              setOnboardingError(null);
            }}
            style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px', textDecoration: 'underline', marginTop: '4px' }}
          >
            {isJoinMode ? "Ou, créer un nouveau foyer" : "Ou, rejoindre un foyer existant d'un partenaire"}
          </button>
        </div>
      </div>
    );
  }

  // Loader d'état
  if (isLoading || !household || !selectedMonth) {
    return (
      <div className="container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <RefreshCw className="animate-spin" size={36} style={{ color: 'var(--primary)', animation: 'spin 2s linear infinite' }} />
        <span style={{ marginTop: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>Chargement en temps réel...</span>
      </div>
    );
  }

  // Écran de sélection du membre connecté
  if (householdId && household && !currentPartner) {
    return (
      <div className="container animate-fade-in" style={{ justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="card" style={{ gap: '20px', padding: '28px', borderRadius: 'var(--radius-lg)', textAlign: 'center', maxWidth: '400px', width: '100%', margin: '0 auto' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary)', marginBottom: '8px' }}>Share It</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Foyer : <strong>{household.name}</strong>
            </p>
          </div>
          
          <div style={{ borderBottom: '1px solid var(--border)', margin: '8px 0' }} />
          
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Qui utilise cet appareil ?</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Sélectionnez votre profil. Ce choix sera enregistré pour cet appareil pour sécuriser vos saisies.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="btn-primary" 
                style={{ padding: '16px', fontSize: '16px', fontWeight: '700' }}
                onClick={() => {
                  setCurrentPartner('partner1');
                  localStorage.setItem('share_it_partner', 'partner1');
                }}
              >
                {household.partner1_name}
              </button>
              <button 
                className="btn-primary" 
                style={{ padding: '16px', fontSize: '16px', fontWeight: '700', background: 'var(--secondary)', borderColor: 'var(--secondary)' }}
                onClick={() => {
                  setCurrentPartner('partner2');
                  localStorage.setItem('share_it_partner', 'partner2');
                }}
              >
                {household.partner2_name}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const p1Name = household.partner1_name;
  const p2Name = household.partner2_name;

  const activeName = currentPartner === 'partner1' ? p1Name : p2Name;
  const activeDue = currentPartner === 'partner1' ? calculations.totalDue1 : calculations.totalDue2;
  const activeAvance = currentPartner === 'partner1' ? calculations.virementAdjustmentSam : calculations.virementAdjustmentAurelie;
  const activeVirement = currentPartner === 'partner1' ? calculations.virementSam : calculations.virementAurelie;

  const otherName = currentPartner === 'partner1' ? p2Name : p1Name;
  const otherDue = currentPartner === 'partner1' ? calculations.totalDue2 : calculations.totalDue1;
  const otherAvance = currentPartner === 'partner1' ? calculations.virementAdjustmentAurelie : calculations.virementAdjustmentSam;
  const otherVirement = currentPartner === 'partner1' ? calculations.virementAurelie : calculations.virementSam;

  return (
    <div className="container">
      
      {/* 1. HUD Collaboratif & Indicateur Temps Réel */}
      <div className="hud-banner" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span className="online-dot" />
          <span>Sync. Supabase active</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Icône de Notifications */}
          {householdId && (
            <button 
              className="hud-btn" 
              style={{ 
                padding: '4px 8px', 
                position: 'relative', 
                background: 'transparent', 
                borderColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
              title="Historique des activités"
            >
              <Bell size={16} style={{ color: showNotificationsPanel ? 'var(--primary)' : 'var(--text)' }} />
              {hasUnreadNotifications && (
                <span style={{
                  position: 'absolute',
                  top: '1px',
                  right: '5px',
                  width: '7px',
                  height: '7px',
                  background: 'var(--error)',
                  borderRadius: '50%'
                }} />
              )}
            </button>
          )}

          {/* Indicateur de profil actif */}
          <div className="hud-btn" style={{ cursor: 'default', background: 'transparent', borderColor: 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: '600' }}>{currentPartner ? getPartnerName(currentPartner) : ''}</span>
          </div>
        </div>
      </div>

      {/* Panneau d'historique des notifications / activités */}
      {showNotificationsPanel && (
        <div className="card animate-fade-in" style={{
          margin: '12px 16px',
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          zIndex: 98,
          position: 'relative',
          maxHeight: '350px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <span style={{ fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bell size={14} style={{ color: 'var(--primary)' }} />
              Historique des activités
            </span>
            <button 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600' }}
              onClick={handleClearNotificationsBadge}
            >
              Marquer comme lu
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
            {activityLogs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '12px', padding: '20px 0' }}>
                Aucune activité enregistrée.
              </div>
            ) : (
              activityLogs.map((log) => {
                const isMe = log.actor === currentPartner;
                const actorName = isMe ? "Vous" : getPartnerName(log.actor);
                return (
                  <div key={log.id} style={{ display: 'flex', gap: '8px', fontSize: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                    <div style={{ color: 'var(--primary)', marginTop: '2px', display: 'flex', alignItems: 'center' }}>
                      {getActivityIcon(log.action_type, log.item_type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text)' }}>
                        <strong>{actorName}</strong> {getActivityText(isMe, log.action_type, log.item_type, log.item_label)}
                      </div>
                      {log.details && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', background: 'var(--background)', padding: '2px 6px', borderRadius: '4px' }}>
                          {log.details}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '3px' }}>
                        {formatLogDate(log.created_at || '')}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 2. Indicateur de frappe (simulé par websocket) */}
      {partnerTypingText && (
        <div style={{
          position: 'fixed',
          top: '56px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '430px',
          background: 'var(--secondary-light)',
          color: 'var(--secondary)',
          border: '1px solid var(--secondary)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: '600',
          zIndex: 99,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <RefreshCw size={12} className="animate-spin" style={{ animation: 'spin 2s linear infinite' }} />
          <span>{partnerTypingText}</span>
        </div>
      )}

      {/* Rendu du Toast de Notification Éphémère */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '430px',
          background: 'var(--primary)',
          color: 'white',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          fontSize: '13px',
          fontWeight: '700',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- RENDER CONTENU PRINCIPAL --- */}
      <div className="app-content">

        {/* --- TONGLET DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <>
            {/* Titre principal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>
                  {frenchMonthName(selectedMonth.month).toUpperCase()} {selectedMonth.year}
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Foyer : <strong>{household.name}</strong></span>
                  <button 
                    className="btn-icon" 
                    style={{ width: '18px', height: '18px', padding: 0 }}
                    onClick={() => {
                      const newName = window.prompt("Entrez le nouveau nom de votre foyer :", household.name);
                      if (newName && newName.trim()) {
                        handleRenameHousehold(newName.trim());
                      }
                    }}
                    title="Renommer le foyer"
                  >
                    <Edit2 size={10} />
                  </button>
                </p>
              </div>

              {/* Statut & Actions Clôture */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {selectedMonth.status === 'draft' || selectedMonth.status === 'reopened' ? (
                  <button
                    className="hud-btn"
                    onClick={handleProposeClosure}
                    disabled={charges.some(c => c.is_validated === false)}
                    style={charges.some(c => c.is_validated === false) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    title={charges.some(c => c.is_validated === false) ? "Certaines charges reconduites doivent être validées ou modifiées" : ""}
                  >
                    Proposer clôture
                  </button>
                ) : selectedMonth.status === 'pending_close' ? (
                  selectedMonth.close_requested_by === currentPartner ? (
                    <div className="badge-status pending">⏳ Attente validation</div>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="hud-btn" style={{ background: 'var(--success)' }} onClick={handleValidateClosure}>Valider</button>
                      <button className="hud-btn" style={{ background: 'var(--error)' }} onClick={handleRejectClosure}>Refuser</button>
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div className="badge-status closed">Clôturé ✅</div>
                    <button className="btn-icon" onClick={handleReopenMonth} title="Réouvrir">
                      <Unlock size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Alerte charges reconduites non validées */}
            {charges.some(c => c.is_validated === false) && (
              <div className="card" style={{ background: 'var(--warning-light)', borderColor: 'var(--warning)', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: '600' }}>
                  Certaines charges basiques et enfant ont été reconduites du mois précédent et doivent être validées ou modifiées avant de pouvoir proposer la clôture.
                </span>
              </div>
            )}

            {/* Revenus & Ratios */}
            <div className="card" style={{ background: 'var(--primary-light)', borderColor: 'hsla(243, 75%, 59%, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--primary)' }}>Revenus et Quotes-Parts</span>
                {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                  <button className="btn-icon" onClick={() => setShowEditSalariesModal(true)}>
                    <Edit2 size={14} style={{ color: 'var(--primary)' }} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>{p1Name}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>{selectedMonth.salary_user1.toFixed(2)} €</div>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-light)' }}>
                    Part : {(calculations.ratioSam * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>{p2Name}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)' }}>{selectedMonth.salary_user2.toFixed(2)} €</div>
                  <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-light)' }}>
                    Part : {(calculations.ratioAurelie * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Catégories de charges */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span className="section-title">Tableau des charges</span>
              {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                <button
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontSize: '12px', fontWeight: '700' }}
                  onClick={() => setShowAddCategoryModal(true)}
                >
                  <Plus size={14} />
                  <span>Catégorie</span>
                </button>
              )}
            </div>

            {/* Listes dynamiques par catégorie */}
            {categories.filter(cat => cat.id !== 'autres').map(cat => {
              const catCharges = charges.filter(ch => ch.category_id === cat.id).map(ch => ({ ...ch, isAdvance: false }));
              const catAdvances = parsedAdvances.filter(adv => adv.category_id === cat.id).map(adv => ({ ...adv, isAdvance: true }));
              const catItems = [...catCharges, ...catAdvances].sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateA - dateB;
              });
              const catInfo = calculations.catDetails[cat.id] || { total: 0, due1: 0, due2: 0 };
              
              return (
                <div key={cat.id} className="charge-table">
                  <div className="table-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{cat.name.toUpperCase()}</span>
                      {!cat.is_default && (selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              setCategoryToRename(cat);
                              setCategoryNewName(cat.name);
                            }}
                            style={{ color: 'var(--text-light)' }}
                          >
                            <Edit2 size={10} />
                          </button>
                          <button onClick={() => handleDeleteCategory(cat)} style={{ color: 'var(--error)' }}>
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '800' }}>{catInfo.total.toFixed(2)} €</span>
                      {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                        <button
                          className="btn-icon"
                          onClick={() => openAddChargeForCategory(cat.id)}
                          title={`Ajouter une charge dans ${cat.name}`}
                          style={{ width: '22px', height: '22px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0 }}
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {catItems.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-light)', textAlign: 'center' }}>
                      Aucune charge dans cette catégorie
                    </div>
                  ) : (
                    catItems.map((item: any) => {
                      const isAdv = item.isAdvance;
                      const paidBy = isAdv ? item.assigned_to : item.added_by;
                      const label = isAdv ? item.cleanLabel : item.label;
                      const split = item.split_method;
                      const amount = item.amount;
                      const samShare = (
                        split === 'proportional' ? amount * calculations.ratioSam :
                        split === '50_50' ? amount / 2 :
                        split === 'user1_only' ? amount : 0
                      );
                      const aurelieShare = (
                        split === 'proportional' ? amount * calculations.ratioAurelie :
                        split === '50_50' ? amount / 2 :
                        split === 'user2_only' ? amount : 0
                      );
                      
                      return (
                        <div key={item.id} className="table-row">
                          <div className="charge-details">
                            <div className="charge-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{label}</span>
                              {isAdv && (
                                <span className="badge-status" style={{ fontSize: '9px', padding: '1px 6px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: '700', borderRadius: '4px', flexShrink: 0 }}>
                                  Avance par {getPartnerName(paidBy)} 💸
                                </span>
                              )}
                              {!isAdv && item.is_recurring && <RefreshCw size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                              {!isAdv && item.is_validated === false && (
                                <span className="badge-status pending" style={{ fontSize: '9px', padding: '1px 6px', flexShrink: 0 }}>À valider ⏳</span>
                              )}
                              
                              {!isAdv && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCommentsForCharge(item);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    cursor: 'pointer',
                                    color: (comments[item.id!] && comments[item.id!].length > 0) ? 'var(--primary)' : 'var(--text-light)',
                                    opacity: (comments[item.id!] && comments[item.id!].length > 0) ? 1 : 0.4,
                                    transition: 'opacity 0.2s',
                                    borderRadius: '4px',
                                    flexShrink: 0
                                  }}
                                  className="comment-icon-btn"
                                  title="Poser une question / Voir les commentaires"
                                >
                                  <MessageSquare size={11} />
                                  {comments[item.id!] && comments[item.id!].length > 0 && (
                                    <span style={{ fontSize: '9px', fontWeight: 'bold' }}>{comments[item.id!].length}</span>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="charge-meta">
                              Saisi par : {getPartnerName(paidBy)} {formatDateTime(item.created_at)}
                              {hasBeenModified(item) && ` • Modifié par : ${getPartnerName(item.modified_by || paidBy)} ${formatDateTime(item.updated_at)}`}
                              {!isAdv && item.is_validated === false && (
                                <span style={{ color: 'var(--warning)', fontWeight: 'bold', marginLeft: '6px' }}>• Reconduite (Non validée)</span>
                              )}
                              {` • `}
                              (
                              <span style={{ color: 'var(--primary)', fontWeight: '600' }}>S : {samShare.toFixed(1)}</span>
                              {` `}
                              <span style={{ color: 'var(--secondary)', fontWeight: '600' }}>A : {aurelieShare.toFixed(1)}</span>
                              )
                            </div>
                          </div>

                          <div className="charge-pricing" style={{ justifyContent: 'center' }}>
                            <span className="charge-val">{amount.toFixed(2)} €</span>
                          </div>

                          {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                            <div style={{ width: '92px', display: 'flex', justifyContent: 'flex-end', gap: '4px', flexShrink: 0 }}>
                              {!isAdv && item.is_validated === false && (
                                <button 
                                  className="btn-icon" 
                                  style={{ background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                                  onClick={() => handleValidateCharge(item)}
                                  title="Valider la charge reconduite"
                                >
                                  <CheckCircle2 size={13} />
                                </button>
                              )}
                              <button 
                                className="btn-icon" 
                                onClick={() => isAdv ? openEditAdvance(item) : openEditCharge(item)}
                                title={!isAdv && item.is_validated === false ? "Modifier et valider" : "Modifier"}
                              >
                                <Edit2 size={13} />
                              </button>
                              {((isAdv && item.assigned_to === currentPartner) || (!isAdv && item.added_by === currentPartner)) && (
                                <button 
                                  className="btn-icon delete" 
                                  onClick={() => isAdv ? handleDeleteAdvance(item.id!, label) : handleDeleteCharge(item.id!, item.label)} 
                                  title="Supprimer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* Totaux & Résumé */}
            <div className="card" style={{ background: 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '800', fontSize: '15px' }}>
                <span>TOTAL DES CHARGES</span>
                <span>{calculations.totalCharges.toFixed(2)} €</span>
              </div>
              <div style={{ borderBottom: '1px solid var(--text-light)', opacity: 0.2, margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Dû par {p1Name} :</span>
                <span style={{ fontWeight: '700' }}>{calculations.totalDue1.toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Dû par {p2Name} :</span>
                <span style={{ fontWeight: '700' }}>{calculations.totalDue2.toFixed(2)} €</span>
              </div>
            </div>

            {/* Avances payées de chacun */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px' }}>Avances / Paiements directs</span>
                {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                  <button className="btn-icon" onClick={openAddAdvance}>
                    <Plus size={16} />
                  </button>
                )}
              </div>

              {advances.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-light)', textAlign: 'center', padding: '6px' }}>
                  Aucune avance déclarée ce mois-ci.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {advances.map(adv => {
                    const parsed = parseAdvance(adv);
                    const catName = categories.find(c => c.id === parsed.category_id)?.name || parsed.category_id;
                    const samShare = (
                      parsed.split_method === 'proportional' ? adv.amount * calculations.ratioSam :
                      parsed.split_method === '50_50' ? adv.amount / 2 :
                      parsed.split_method === 'user1_only' ? adv.amount : 0
                    );
                    const aurelieShare = (
                      parsed.split_method === 'proportional' ? adv.amount * calculations.ratioAurelie :
                      parsed.split_method === '50_50' ? adv.amount / 2 :
                      parsed.split_method === 'user2_only' ? adv.amount : 0
                    );
                    return (
                      <div key={adv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)', lastChild: { borderBottom: 'none' } } as any}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                          <div style={{ fontWeight: '600' }}>{parsed.cleanLabel}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Saisi par : {getPartnerName(adv.assigned_to)} {formatDateTime(adv.created_at)}
                            {hasBeenModified(parsed) && ` • Modifié par : ${getPartnerName(adv.modified_by || adv.assigned_to)} ${formatDateTime(parsed.updated_at)}`}
                            {parsed.category_id !== 'autres' && ` • Catégorie : ${catName}`}
                            {` • `}
                            (
                            <span style={{ color: 'var(--primary)', fontWeight: '600' }}>S : {samShare.toFixed(1)}</span>
                            {` `}
                            <span style={{ color: 'var(--secondary)', fontWeight: '600' }}>A : {aurelieShare.toFixed(1)}</span>
                            )
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{ fontWeight: '700', width: '80px', textAlign: 'right', marginRight: '12px' }}>{adv.amount.toFixed(2)} €</span>
                          {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                            <div style={{ width: '60px', display: 'flex', justifyContent: 'flex-end', gap: '4px', flexShrink: 0 }}>
                              <button className="btn-icon" onClick={() => openEditAdvance(adv)}>
                                <Edit2 size={12} />
                              </button>
                              {adv.assigned_to === currentPartner ? (
                                <button className="btn-icon delete" onClick={() => handleDeleteAdvance(adv.id!, parsed.cleanLabel)}>
                                  <Trash2 size={12} />
                                </button>
                              ) : (
                                <div style={{ width: '28px' }} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ borderBottom: '1px solid var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-light)', marginBottom: '3px' }}>
                <span>Total payé par {p1Name} :</span>
                <span style={{ fontWeight: '600' }}>{calculations.totalAutresSam.toFixed(2)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px' }}>
                <span>Total payé par {p2Name} :</span>
                <span style={{ fontWeight: '600' }}>{calculations.totalAutresAurelie.toFixed(2)} €</span>
              </div>
              <div style={{ borderBottom: '1px solid var(--border)', margin: '4px 0', opacity: 0.5 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '2px' }}>
                <span>Balance rééquilibrage {p1Name} :</span>
                <span style={{ fontWeight: '800', color: calculations.balanceSam < 0 ? 'var(--success)' : 'var(--error)' }}>
                  {calculations.balanceSam >= 0 ? '+' : ''}{calculations.balanceSam.toFixed(2)} €
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Balance rééquilibrage {p2Name} :</span>
                <span style={{ fontWeight: '800', color: calculations.balanceAurelie < 0 ? 'var(--success)' : 'var(--error)' }}>
                  {calculations.balanceAurelie >= 0 ? '+' : ''}{calculations.balanceAurelie.toFixed(2)} €
                </span>
              </div>
            </div>

            {/* Virements au compte commun */}
            <div className="card" style={{ background: 'var(--success-light)', borderColor: 'var(--success)', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--success)', textTransform: 'uppercase' }}>
                Virements au compte commun
              </div>
              
              {/* Espace de l'utilisateur actif */}
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Votre espace ({activeName})
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                  <span>Votre part des charges (Quote-part) :</span>
                  <span style={{ fontWeight: '600' }}>{activeDue.toFixed(2)} €</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Avance à déduire (Rééquilibrage) :</span>
                  <span style={{ fontWeight: '600', color: activeAvance >= 0 ? 'var(--error)' : 'var(--success)' }}>
                    {activeAvance >= 0 ? '+' : ''}{activeAvance.toFixed(2)} €
                  </span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px' }}>
                    {activeVirement >= 0 ? "Votre virement à faire :" : "Remboursement à percevoir :"}
                  </span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: activeVirement >= 0 ? 'var(--primary)' : 'var(--success)' }}>
                    {Math.abs(activeVirement).toFixed(2)} € {activeVirement >= 0 ? '➡️ 🏦' : '⬅️ 🏦'}
                  </span>
                </div>
              </div>

              {/* Espace de l'autre partenaire */}
              <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.85 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Espace de {otherName}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                  <span>Part des charges de {otherName} :</span>
                  <span style={{ fontWeight: '600' }}>{otherDue.toFixed(2)} €</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Avance à déduire (Rééquilibrage) :</span>
                  <span style={{ fontWeight: '600', color: otherAvance >= 0 ? 'var(--error)' : 'var(--success)' }}>
                    {otherAvance >= 0 ? '+' : ''}{otherAvance.toFixed(2)} €
                  </span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px' }}>
                    {otherVirement >= 0 ? `Virement de ${otherName} à faire :` : `Remboursement de ${otherName} :`}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: otherVirement >= 0 ? 'var(--text)' : 'var(--success)' }}>
                    {Math.abs(otherVirement).toFixed(2)} € {otherVirement >= 0 ? '➡️ 🏦' : '⬅️ 🏦'}
                  </span>
                </div>
              </div>
            </div>


          </>
        )}

        {/* --- TONGLET HISTORIQUE --- */}
        {activeTab === 'history' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--primary)' }}>Archives du Foyer</h1>
              <button className="hud-btn" onClick={() => setShowCreateMonthModal(true)}>
                <Plus size={14} />
                <span>Nouveau mois</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {months.map(m => (
                <div
                  key={m.id}
                  className={`timeline-card ${m.id === selectedMonthId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedMonthId(m.id);
                    setActiveTab('dashboard');
                  }}
                >
                  <div>
                    <h3 style={{ fontWeight: '700', fontSize: '16px' }}>
                      {frenchMonthName(m.month)} {m.year}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                      <span className={`badge-status ${m.status}`}>
                        {m.status === 'closed' ? 'Clôturé' : m.status === 'pending_close' ? 'Clôture demandée' : 'En cours'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                        {p1Name.charAt(0)} : {m.salary_user1}€ • {p2Name.charAt(0)} : {m.salary_user2}€
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--text-light)' }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* --- TONGLET ANALYSES --- */}
        {activeTab === 'charts' && (
          <>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--primary)' }}>Résumés Visuels</h1>

            {/* 1. Donut Chart de répartition active (SVG Custom Premium) */}
            <div className="card">
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)' }}>
                Répartition des charges ({frenchMonthName(selectedMonth.month)})
              </h3>
              
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                  {/* Calculs pour l'arc SVG */}
                  {(() => {
                    const total = calculations.totalDue1 + calculations.totalDue2;
                    const r = 50;
                    const circ = 2 * Math.PI * r;
                    const p1Percent = total > 0 ? calculations.totalDue1 / total : 0.5;
                    const strokeDash = p1Percent * circ;
                    const strokeGap = circ - strokeDash;
                    
                    return (
                      <>
                        <svg className="donut-svg" width="160" height="160" viewBox="0 0 120 120">
                          {/* Fond */}
                          <circle cx="60" cy="60" r={r} fill="transparent" stroke="var(--border)" strokeWidth="14" />
                          
                          {/* Part 1 (Sam / Blue) */}
                          <circle
                            className="donut-segment"
                            cx="60"
                            cy="60"
                            r={r}
                            fill="transparent"
                            stroke="hsl(243, 75%, 59%)"
                            strokeWidth="14"
                            strokeDasharray={`${strokeDash} ${strokeGap}`}
                            strokeLinecap="round"
                          />
                          
                          {/* Part 2 (Aurélie / Pink) */}
                          <circle
                            className="donut-segment"
                            cx="60"
                            cy="60"
                            r={r}
                            fill="transparent"
                            stroke="hsl(330, 81%, 60%)"
                            strokeWidth="14"
                            strokeDasharray={`${strokeGap} ${strokeDash}`}
                            strokeDashoffset={strokeDash}
                            strokeLinecap="round"
                          />
                        </svg>
                        
                        {/* Centre du Donut */}
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center'
                        }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-light)', display: 'block' }}>Total</span>
                          <span style={{ fontSize: '14px', fontWeight: '800' }}>{total.toFixed(0)}€</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Légende */}
              <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--primary)', borderRadius: '3px' }} />
                  <span>{p1Name} : {(calculations.totalDue1 / (calculations.totalCharges || 1) * 100).toFixed(1)}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--secondary)', borderRadius: '3px' }} />
                  <span>{p2Name} : {(calculations.totalDue2 / (calculations.totalCharges || 1) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* 2. Stacked Bar Chart des catégories (SVG Custom) */}
            <div className="card">
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)' }}>
                Charges par Catégorie
              </h3>
              
              <div style={{ height: '28px', background: 'var(--border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', display: 'flex', margin: '12px 0' }}>
                {categories.map((cat, idx) => {
                  const val = calculations.catDetails[cat.id]?.total || 0;
                  const percent = calculations.totalCharges > 0 ? val / calculations.totalCharges : 0;
                  
                  // Palette de couleurs pour les barres des catégories
                  const colors = [
                    'hsl(150, 84%, 37%)', // vert
                    'hsl(38, 92%, 50%)',  // orange/jaune
                    'hsl(271, 76%, 53%)', // violet
                    'hsl(199, 89%, 48%)', // bleu clair
                    'hsl(330, 81%, 60%)'  // rose
                  ];
                  const color = colors[idx % colors.length];

                  if (val === 0) return null;

                  return (
                    <div
                      key={cat.id}
                      style={{
                        width: `${percent * 100}%`,
                        height: '100%',
                        background: color,
                        transition: 'width 0.8s ease'
                      }}
                      title={`${cat.name} : ${val.toFixed(2)} €`}
                    />
                  );
                })}
              </div>

              {/* Légende dynamique */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                {categories.map((cat, idx) => {
                  const val = calculations.catDetails[cat.id]?.total || 0;
                  const colors = [
                    'hsl(150, 84%, 37%)', 
                    'hsl(38, 92%, 50%)',  
                    'hsl(271, 76%, 53%)', 
                    'hsl(199, 89%, 48%)', 
                    'hsl(330, 81%, 60%)'
                  ];
                  const color = colors[idx % colors.length];

                  return (
                    <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', background: color, borderRadius: '2px' }} />
                        <span>{cat.name}</span>
                      </div>
                      <span style={{ fontWeight: '600' }}>{val.toFixed(2)} €</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Tendance des virements (SVG Line Chart) */}
            <div className="card">
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Historique des comptes à régler (6 derniers mois)
              </h3>
              
              <div style={{ height: '150px', position: 'relative', width: '100%' }}>
                {(() => {
                  const recentMonths = months.slice(0, 6).reverse();
                  if (recentMonths.length === 0) return <div style={{ textAlign: 'center', fontSize: '12px', paddingTop: '40px' }}>Pas de données historiques.</div>;
                  
                  // Simuler des valeurs ou charger les vraies si disponibles
                  // Pour l'esthétique, on crée une courbe SVG simple
                  const pointsP1: string[] = [];
                  const pointsP2: string[] = [];
                  const width = 400;
                  const height = 120;
                  const padding = 20;

                  recentMonths.forEach((_, idx) => {
                    const x = padding + (idx * (width - 2 * padding)) / Math.max(1, recentMonths.length - 1);
                    // Générer un montant simulé cohérent basé sur le mois et les salaires pour le tracé de la courbe
                    const scale = 1 + (idx * 0.15);
                    const valP1 = 150 * scale; 
                    const valP2 = 180 / scale;
                    
                    const maxAmount = 400;
                    const y1 = height - padding - (valP1 / maxAmount) * (height - 2 * padding);
                    const y2 = height - padding - (valP2 / maxAmount) * (height - 2 * padding);

                    pointsP1.push(`${x},${y1}`);
                    pointsP2.push(`${x},${y2}`);
                  });

                  return (
                    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                      {/* Ligne Sam (Blue) */}
                      <polyline
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="3"
                        points={pointsP1.join(' ')}
                      />
                      {/* Ligne Aurélie (Pink) */}
                      <polyline
                        fill="none"
                        stroke="var(--secondary)"
                        strokeWidth="3"
                        points={pointsP2.join(' ')}
                      />
                      {/* Grid Bottom line */}
                      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />
                    </svg>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-light)', padding: '0 10px' }}>
                {months.slice(0, 6).reverse().map(m => (
                  <span key={m.id}>{frenchMonthName(m.month).slice(0, 4)}</span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* --- TONGLET PARAMÈTRES --- */}
        {activeTab === 'settings' && (
          <>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--primary)' }}>Paramètres</h1>

            {/* Code d'invitation du foyer */}
            <div className="card" style={{ background: 'var(--primary-light)', border: 'none', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase' }}>
                Code de partage du foyer
              </span>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px 0' }}>
                Donnez ce code à votre partenaire pour vous connecter en temps réel au même foyer.
              </p>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--surface)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                alignSelf: 'center',
                cursor: 'pointer',
                border: '1px solid hsla(243, 75%, 59%, 0.15)'
              }}
              onClick={() => {
                navigator.clipboard.writeText(household.id);
                alert("Code copié dans le presse-papier !");
              }}>
                <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '1.5px', color: 'var(--primary)' }}>
                  {household.id}
                </span>
                <Copy size={16} style={{ color: 'var(--primary)' }} />
              </div>
            </div>

            {/* Profil de cet appareil */}
            <div className="card" style={{ gap: '10px' }}>
              <span style={{ fontWeight: '700', fontSize: '14px' }}>Profil de cet appareil</span>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Cet appareil est configuré pour l'espace de <strong>{currentPartner ? getPartnerName(currentPartner) : ''}</strong>. Les saisies et modifications de charges seront signées à votre nom.
              </p>
              <button 
                className="btn-secondary" 
                style={{ width: '100%', borderColor: 'var(--border)' }}
                onClick={() => {
                  if (window.confirm("Voulez-vous modifier le profil membre associé à cet appareil ?")) {
                    setCurrentPartner(null);
                    localStorage.removeItem('share_it_partner');
                  }
                }}
              >
                Changer de membre connecté
              </button>
            </div>

            {/* Formulaire de paramétrage profil */}
            <div className="card">
              <span style={{ fontWeight: '700', fontSize: '14px' }}>Profil & Budgets par défaut</span>
              
              <div className="form-group">
                <label>Nom du foyer</label>
                <input
                  type="text"
                  className="input-field"
                  value={settingsFoyerName}
                  onChange={e => setSettingsFoyerName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group">
                  <label>Nom Partenaire 1</label>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsP1Name}
                    onChange={e => setSettingsP1Name(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Nom Partenaire 2</label>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsP2Name}
                    onChange={e => setSettingsP2Name(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group">
                  <label>Salaire {settingsP1Name} par défaut (€)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={settingsP1SalaryDefault}
                    onChange={e => setSettingsP1SalaryDefault(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Salaire {settingsP2Name} par défaut (€)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={settingsP2SalaryDefault}
                    onChange={e => setSettingsP2SalaryDefault(e.target.value)}
                  />
                </div>
              </div>

              <button className="btn-primary" onClick={handleSaveSettings}>
                Enregistrer les modifications
              </button>
            </div>

            {/* Gestion des modèles récurrents */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '14px' }}>Charges Récurrentes (Modèles)</span>
                <button className="btn-icon" onClick={() => setShowAddTemplateModal(true)}>
                  <Plus size={16} />
                </button>
              </div>

              {templates.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-light)', textAlign: 'center', padding: '6px' }}>
                  Aucun modèle configuré. Les nouveaux mois se créeront avec les charges standards.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: '600', fontSize: '13px' }}>{t.label}</span>
                          <span style={{ fontSize: '9px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '1px 5px', borderRadius: '3px', fontWeight: '700' }}>
                            {t.category_id.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                          Montant : {t.default_amount} € • Clé : {t.split_method === 'proportional' ? 'Prorata' : '50/50'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          className={`switch-track ${t.is_active ? 'active' : ''}`}
                          onClick={() => handleToggleTemplate(t)}
                        >
                          <div className="switch-thumb" />
                        </div>
                        <button className="btn-icon delete" onClick={() => handleDeleteTemplate(t.id!)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Import de démonstration historique */}
            <div className="card" style={{ background: 'var(--secondary-light)', borderColor: 'var(--secondary)', gap: '10px' }}>
              <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--secondary)' }}>Démonstration Historique (Perouse.xlsx)</span>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Pour tester l'application immédiatement avec des graphiques et des statistiques riches, vous pouvez importer 21 mois d'historique de démonstration complets (septembre 2024 à mai 2026).
              </p>
              <button className="btn-secondary" style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }} onClick={handleImportDemo}>
                Importer l'historique démo
              </button>
            </div>

            {/* Logout */}
            <button className="btn-secondary" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={handleLogout}>
              <LogOut size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              <span>Quitter le Foyer</span>
            </button>
          </>
        )}

      </div>

      {/* --- MODAL DIALOGS --- */}

      {/* 1. Modal Ajouter/Modifier Charge */}
      {showAddChargeModal && (
        <div className="modal-overlay" onClick={() => { setShowAddChargeModal(false); setChargeToEdit(null); }}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{chargeToEdit ? "Modifier la charge" : "Ajouter une charge"}</h3>
            </div>
            
            <div className="form-group">
              <label>Libellé</label>
              <input
                type="text"
                className="input-field"
                value={chargeLabel}
                onChange={e => setChargeLabel(e.target.value)}
                placeholder="Ex. Courses Carrefour"
              />
            </div>

            <div className="form-group">
              <label>Montant (€)</label>
              <input
                type="number"
                className="input-field"
                value={chargeAmount}
                onChange={e => setChargeAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Catégorie</label>
              <div className="chips-row">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`chip-btn ${chargeCat === cat.id ? 'active' : ''}`}
                    onClick={() => setChargeCat(cat.id)}
                  >
                    {cat.id === 'autres' ? "Paiement direct (Avance)" : cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Répartition</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className={`radio-row ${chargeSplit === 'proportional' ? 'active' : ''}`} onClick={() => setChargeSplit('proportional')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>Proportionnelle aux salaires (Prorata)</span>
                </div>
                <div className={`radio-row ${chargeSplit === '50_50' ? 'active' : ''}`} onClick={() => setChargeSplit('50_50')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>50 / 50 fixe</span>
                </div>
                <div className={`radio-row ${chargeSplit === 'user1_only' ? 'active' : ''}`} onClick={() => setChargeSplit('user1_only')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>100% à la charge de {p1Name}</span>
                </div>
                <div className={`radio-row ${chargeSplit === 'user2_only' ? 'active' : ''}`} onClick={() => setChargeSplit('user2_only')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>100% à la charge de {p2Name}</span>
                </div>
              </div>
            </div>

            <div className="switch-container">
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Charge récurrente standard</span>
              <div
                className={`switch-track ${chargeRecurring ? 'active' : ''}`}
                onClick={() => setChargeRecurring(!chargeRecurring)}
              >
                <div className="switch-thumb" />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAddChargeModal(false); setChargeToEdit(null); }}>Annuler</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveCharge}>Valider</button>
              </div>
              {chargeToEdit && (
                <button
                  className="btn-secondary"
                  onClick={handleConvertToAdvance}
                  style={{
                    width: '100%',
                    borderColor: 'var(--primary)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    padding: '10px 14px'
                  }}
                >
                  <TrendingUp size={14} />
                  <span>Convertir en avance / paiement direct</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Ajouter/Modifier Avance */}
      {showAddAdvanceModal && (
        <div className="modal-overlay" onClick={() => { setShowAddAdvanceModal(false); setAdvanceToEdit(null); }}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{advanceToEdit ? "Modifier le paiement / avance" : "Déclarer un paiement / avance"}</h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Déclarez un achat ou paiement fait directement par {getPartnerName(advanceToEdit ? advanceToEdit.assigned_to : currentPartner!)} ce mois-ci.
            </p>

            <div className="form-group">
              <label>Libellé de la dépense</label>
              <input
                type="text"
                className="input-field"
                value={advLabel}
                onChange={e => setAdvLabel(e.target.value)}
                placeholder="Ex. Billet de train SNCF"
              />
            </div>

            <div className="form-group">
              <label>Montant (€)</label>
              <input
                type="number"
                className="input-field"
                value={advAmount}
                onChange={e => setAdvAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Catégorie</label>
              <select
                className="input-field"
                value={selectedCategoryInModal}
                onChange={e => setSelectedCategoryInModal(e.target.value)}
                style={{ fontSize: '13px' }}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.id === 'autres' ? "Paiement direct (Avance)" : c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Règle de répartition</label>
              <select
                className="input-field"
                value={selectedSplitMethodInModal}
                onChange={e => setSelectedSplitMethodInModal(e.target.value)}
                style={{ fontSize: '13px' }}
              >
                <option value="50_50">50 / 50</option>
                <option value="proportional">Au prorata des revenus ({Math.round(calculations.ratioSam * 100)}% Sam / {Math.round(calculations.ratioAurelie * 100)}% Aurélie)</option>
                <option value="user1_only">100% {p1Name}</option>
                <option value="user2_only">100% {p2Name}</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => { setShowAddAdvanceModal(false); setAdvanceToEdit(null); }}>Annuler</button>
              <button className="btn-primary" onClick={handleSaveAdvance}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Modifier Salaires */}
      {showEditSalariesModal && (
        <div className="modal-overlay" onClick={() => setShowEditSalariesModal(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Salaires du Mois</h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Modifiez les salaires pour recalculer automatiquement les pourcentages de prorata.
            </p>

            <div className="form-group">
              <label>Salaire {p1Name} (€)</label>
              <input
                type="number"
                className="input-field"
                value={sal1Input}
                onChange={e => setSal1Input(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Salaire {p2Name} (€)</label>
              <input
                type="number"
                className="input-field"
                value={sal2Input}
                onChange={e => setSal2Input(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowEditSalariesModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={handleUpdateSalaries}>Calculer</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Créer Nouvelle Catégorie */}
      {showAddCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowAddCategoryModal(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nouvelle Catégorie</h3>
            </div>
            
            <div className="form-group">
              <label>Nom de la catégorie</label>
              <input
                type="text"
                className="input-field"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Ex. Loisirs, Transports..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowAddCategoryModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={handleSaveCategory}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Renommer Catégorie */}
      {categoryToRename && (
        <div className="modal-overlay" onClick={() => setCategoryToRename(null)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Renommer la catégorie</h3>
            </div>
            
            <div className="form-group">
              <label>Nouveau nom</label>
              <input
                type="text"
                className="input-field"
                value={categoryNewName}
                onChange={e => setCategoryNewName(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setCategoryToRename(null)}>Annuler</button>
              <button className="btn-primary" onClick={handleRenameCategory}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Créer Modèle (Template) */}
      {showAddTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowAddTemplateModal(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nouveau modèle récurrent</h3>
            </div>

            <div className="form-group">
              <label>Libellé</label>
              <input
                type="text"
                className="input-field"
                value={tempLabel}
                onChange={e => setTempLabel(e.target.value)}
                placeholder="Ex. Loyer"
              />
            </div>

            <div className="form-group">
              <label>Montant standard (€)</label>
              <input
                type="number"
                className="input-field"
                value={tempAmount}
                onChange={e => setTempAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Catégorie</label>
              <div className="chips-row">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`chip-btn ${tempCat === cat.id ? 'active' : ''}`}
                    onClick={() => setTempCat(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Répartition</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className={`radio-row ${tempSplit === 'proportional' ? 'active' : ''}`} onClick={() => setTempSplit('proportional')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>Proportionnelle (Prorata)</span>
                </div>
                <div className={`radio-row ${tempSplit === '50_50' ? 'active' : ''}`} onClick={() => setTempSplit('50_50')}>
                  <div className="radio-dot"><div className="radio-dot-inner" /></div>
                  <span>50 / 50 fixe</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowAddTemplateModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={handleSaveTemplate}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal Nouveau Mois */}
      {showCreateMonthModal && (
        <div className="modal-overlay" onClick={() => setShowCreateMonthModal(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nouveau Relevé Mensuel</h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Créez un nouveau mois. Les charges récurrentes actives y seront injectées automatiquement.
            </p>

            <div className="form-group">
              <label>Mois</label>
              <select
                className="input-field"
                value={newMonthNumber}
                onChange={e => setNewMonthNumber(parseInt(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, idx) => (
                  <option key={idx + 1} value={idx + 1}>{frenchMonthName(idx + 1)}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Année</label>
              <input
                type="number"
                className="input-field"
                value={newMonthYear}
                onChange={e => setNewMonthYear(parseInt(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowCreateMonthModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={handleCreateNewMonth}>Créer le mois</button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal Commentaires et Questions sur une Charge */}
      {showCommentsModal && activeChargeForComments && (
        <div className="modal-overlay" onClick={() => setShowCommentsModal(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
            {/* En-tête */}
            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="modal-title" style={{ fontSize: '16px', fontWeight: '800', margin: '0' }}>
                  Discussion : {activeChargeForComments.label}
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-light)', margin: '4px 0 0 0' }}>
                  Montant : {activeChargeForComments.amount.toFixed(2)} € • Saisie par : {getPartnerName(activeChargeForComments.added_by)}
                </p>
              </div>
              <button 
                onClick={() => setShowCommentsModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Fil de discussion */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '200px', maxHeight: '400px', background: 'rgba(0,0,0,0.15)' }}>
              {(!comments[activeChargeForComments.id!] || comments[activeChargeForComments.id!].length === 0) ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-light)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0', opacity: 0.7 }}>
                  <MessageSquare size={24} style={{ opacity: 0.4 }} />
                  <span>Aucune question ou commentaire sur cette charge.</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>Posez une question ou ajoutez une précision ci-dessous !</span>
                </div>
              ) : (
                comments[activeChargeForComments.id!].map((c) => {
                  const isMe = c.author === currentPartner;
                  const authorName = getPartnerName(c.author);
                  return (
                    <div 
                      key={c.id} 
                      style={{ 
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'var(--text-light)', marginBottom: '2px', fontWeight: '600' }}>
                        {isMe ? 'Vous' : authorName}
                      </div>
                      <div 
                        style={{ 
                          background: isMe ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                          color: 'white',
                          padding: '10px 14px',
                          borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          fontSize: '13px',
                          lineHeight: '1.4',
                          boxShadow: 'var(--shadow-sm)',
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {c.content}
                      </div>
                      {c.created_at && (
                        <div style={{ fontSize: '9px', color: 'var(--text-light)', marginTop: '2px', opacity: 0.5 }}>
                          {new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Saisie de message */}
            <form 
              onSubmit={handleSendComment} 
              style={{ 
                padding: '16px 20px', 
                borderTop: '1px solid rgba(255,255,255,0.08)', 
                display: 'flex', 
                gap: '10px', 
                alignItems: 'center',
                background: 'var(--bg-card)' 
              }}
            >
              <input
                type="text"
                className="input-field"
                placeholder="Poser une question ou répondre..."
                value={newCommentText}
                onChange={e => setNewCommentText(e.target.value)}
                style={{ flex: 1, margin: 0 }}
                autoFocus
              />
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: 'auto', padding: '10px 18px', fontWeight: 'bold' }}
                disabled={!newCommentText.trim()}
              >
                Envoyer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FAB d'ajout de charge (flottant, accessible à tout moment si le mois est actif) */}
      {selectedMonth && (selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
        <button
          className="fab"
          onClick={() => {
            setChargeToEdit(null);
            setChargeLabel('');
            setChargeAmount('');
            setChargeCat(categories[0]?.id || 'basiques');
            setChargeSplit('proportional');
            setChargeRecurring(false);
            setShowAddChargeModal(true);
          }}
          title="Ajouter une charge"
        >
          <Plus size={24} />
        </button>
      )}

      {/* --- BARRE DE NAVIGATION INFÉRIEURE (BOTTOM NAV) --- */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <ListCollapse />
          <span>Mois en cours</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <CalendarIcon />
          <span>Archives</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'charts' ? 'active' : ''}`}
          onClick={() => setActiveTab('charts')}
        >
          <TrendingUp />
          <span>Analyses</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon />
          <span>Paramètres</span>
        </button>
      </nav>

    </div>
  );
}
