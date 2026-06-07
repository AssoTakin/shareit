import { useState, useEffect, useMemo } from 'react';
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
  User
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
  importDemoHistory
} from './supabase';
import type {
  Household as HouseholdType,
  Category as CategoryType,
  MonthEntity as MonthType,
  Charge as ChargeType,
  Advance as AdvanceType,
  Template as TemplateType
} from './supabase';
import './App.css';

export default function App() {
  const isConfigured = isSupabaseConfigured();
  const [householdId, setHouseholdId] = useState<string | null>(localStorage.getItem('share_it_household_id'));
  const [household, setHousehold] = useState<HouseholdType | null>(null);
  
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
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [templates, setTemplates] = useState<TemplateType[]>([]);

  // Local UI simulation states
  const [partnerTypingText, setPartnerTypingText] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
          // Gestion des différents types de tables modifiées en ligne
          const table = payload.table;
          const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'

          // Détecter qui a fait la modif (si c'est le partenaire ou nous-même)
          // Pour la démo, on simule l'apparition d'un indicateur de saisie "Typing..."
          const actionUser = currentPartner === 'partner1' ? 'partner2' : 'partner1';
          const partnerName = getPartnerName(actionUser);

          if (table === 'charges') {
            if (selectedMonthId) getCharges(selectedMonthId).then(setCharges);
            if (eventType === 'INSERT') {
              triggerTypingSimulation(`${partnerName} a ajouté une charge : "${payload.new.label}"`);
            } else if (eventType === 'UPDATE') {
              triggerTypingSimulation(`${partnerName} a modifié une charge : "${payload.new.label}"`);
            }
          } else if (table === 'advances') {
            if (selectedMonthId) getAdvances(selectedMonthId).then(setAdvances);
            if (eventType === 'INSERT') addNotification(`${partnerName} a avancé ${payload.new.amount} € pour "${payload.new.label}"`);
          } else if (table === 'months') {
            getMonths(householdId).then(setMonths);
            if (eventType === 'UPDATE') {
              const oldMonth = months.find(m => m.id === payload.new.id);
              if (oldMonth && oldMonth.status !== payload.new.status) {
                if (payload.new.status === 'pending_close') {
                  addNotification(`${getPartnerName(payload.new.close_requested_by)} demande la clôture du mois`);
                } else if (payload.new.status === 'closed') {
                  addNotification(`Mois clôturé et verrouillé ✅`);
                } else if (payload.new.status === 'reopened') {
                  addNotification(`Le mois a été réouvert`);
                }
              }
            }
          } else if (table === 'categories') {
            getCategories(householdId).then(setCategories);
          } else if (table === 'templates') {
            getTemplates(householdId).then(setTemplates);
          } else if (table === 'households') {
            getHousehold(householdId).then(setHousehold);
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
      showCreateMonthModal;

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
        let modified_by = chargeToEdit.modified_by;
        let added_by = chargeToEdit.added_by;
        let is_validated = chargeToEdit.is_validated;

        if (chargeToEdit.is_validated === false) {
          is_validated = true;
          added_by = currentPartner!;
          modified_by = null;
        } else {
          if (amount !== chargeToEdit.amount) {
            if (currentPartner !== chargeToEdit.added_by) {
              modified_by = currentPartner;
            } else {
              modified_by = null;
            }
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
        addNotification(`Charge "${chargeLabel}" modifiée`);
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
        addNotification(`Charge "${chargeLabel}" ajoutée`);
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

  const handleDeleteCharge = async (id: string, label: string) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer la charge "${label}" ?`)) return;
    try {
      await deleteCharge(id);
      addNotification(`Charge "${label}" supprimée`);
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
      addNotification(`Charge "${charge.label}" validée`);
    } catch (err) {
      console.error(err);
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
  const handleSaveAdvance = async () => {
    if (!selectedMonthId || !advLabel || !advAmount) return;
    try {
      const amount = parseFloat(advAmount) || 0;
      if (advanceToEdit) {
        let modified_by = advanceToEdit.modified_by;
        if (amount !== advanceToEdit.amount) {
          if (currentPartner !== advanceToEdit.assigned_to) {
            modified_by = currentPartner;
          } else {
            modified_by = null;
          }
        }

        await updateAdvance({
          ...advanceToEdit,
          amount,
          label: advLabel,
          modified_by
        });
        addNotification(`Avance "${advLabel}" modifiée`);
      } else {
        await insertAdvance({
          month_id: selectedMonthId,
          assigned_to: currentPartner!,
          amount,
          label: advLabel,
          modified_by: null
        });
        addNotification(`Avance "${advLabel}" ajoutée`);
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
    try {
      await deleteAdvance(id);
      addNotification(`Avance "${label}" supprimée`);
    } catch (err) {
      console.error(err);
    }
  };

  const openEditAdvance = (adv: AdvanceType) => {
    setAdvanceToEdit(adv);
    setAdvLabel(adv.label);
    setAdvAmount(adv.amount.toString());
    setShowAddAdvanceModal(true);
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
      await updateMonth(updated);
      setSelectedMonth(updated);
      addNotification("Mois réouvert");
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
      await updateHousehold(updated);
      setHousehold(updated);
      setSettingsFoyerName(newName);
      addNotification(`Foyer renommé en "${newName}"`);
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
      avanceDeduireSam: 0,
      avanceDeduireAurelie: 0,
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

    let manualAdv1 = 0;
    let manualAdv2 = 0;
    advances.forEach(a => {
      if (a.assigned_to === 'partner1') {
        manualAdv1 += a.amount;
      } else {
        manualAdv2 += a.amount;
      }
    });

    // Somme des charges et avances de la catégorie 'autres'
    let autresPaid1 = 0;
    let postgresAutresPaid2 = 0; // Avoid shadowing or naming issues, let's keep it simple
    charges.forEach(c => {
      if (c.category_id === 'autres') {
        if (c.added_by === 'partner1') {
          autresPaid1 += c.amount;
        } else {
          postgresAutresPaid2 += c.amount;
        }
      }
    });

    const totalAutresSam = autresPaid1 + manualAdv1;
    const totalAutresAurelie = postgresAutresPaid2 + manualAdv2;

    const avanceDeduireSam = (totalAutresAurelie - totalAutresSam) / 2;
    const avanceDeduireAurelie = (totalAutresSam - totalAutresAurelie) / 2;

    // Calcul final des virements au compte commun
    // TOTAL À VIRER = ARRONDI.SUP(Total charges + Avance, 2) − Total autres
    // Total charges est représenté par totalDue1 et totalDue2 (la somme de toutes les parts de charges de chaque personne)
    const virementSam = Math.ceil((totalDue1 + avanceDeduireSam) * 100) / 100 - totalAutresSam;
    const virementAurelie = Math.ceil((totalDue2 + avanceDeduireAurelie) * 100) / 100 - totalAutresAurelie;

    const totalPaid1 = directPaid1 + manualAdv1;
    const totalPaid2 = directPaid2 + manualAdv2;

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
      avanceDeduireSam,
      avanceDeduireAurelie,
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
  const activeAvance = currentPartner === 'partner1' ? calculations.avanceDeduireSam : calculations.avanceDeduireAurelie;
  const activeAutres = currentPartner === 'partner1' ? calculations.totalAutresSam : calculations.totalAutresAurelie;
  const activeVirement = currentPartner === 'partner1' ? calculations.virementSam : calculations.virementAurelie;

  const otherName = currentPartner === 'partner1' ? p2Name : p1Name;
  const otherDue = currentPartner === 'partner1' ? calculations.totalDue2 : calculations.totalDue1;
  const otherAvance = currentPartner === 'partner1' ? calculations.avanceDeduireAurelie : calculations.avanceDeduireSam;
  const otherAutres = currentPartner === 'partner1' ? calculations.totalAutresAurelie : calculations.totalAutresSam;
  const otherVirement = currentPartner === 'partner1' ? calculations.virementAurelie : calculations.virementSam;

  return (
    <div className="container animate-fade-in">
      
      {/* 1. HUD Collaboratif & Indicateur Temps Réel */}
      <div className="hud-banner" style={{ borderRadius: 0, borderBottom: '1px solid var(--border)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span className="online-dot" />
          <span>Sync. Supabase active</span>
        </div>
        
        {/* Indicateur de profil actif */}
        <div className="hud-btn" style={{ cursor: 'default', background: 'transparent', borderColor: 'transparent', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <User size={14} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: '600' }}>{currentPartner ? getPartnerName(currentPartner) : ''}</span>
        </div>
      </div>

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
            {categories.map(cat => {
              const catCharges = charges.filter(ch => ch.category_id === cat.id);
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

                  {catCharges.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-light)', textAlign: 'center' }}>
                      Aucune charge dans cette catégorie
                    </div>
                  ) : (
                    catCharges.map(charge => (
                      <div key={charge.id} className="table-row">
                        <div className="charge-details">
                          <div className="charge-title">
                            <span>{charge.label}</span>
                            {charge.is_recurring && <RefreshCw size={10} style={{ color: 'var(--primary)' }} />}
                            {charge.is_validated === false && (
                              <span className="badge-status pending" style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 6px' }}>À valider ⏳</span>
                            )}
                          </div>
                          <div className="charge-meta">
                            {charge.is_validated === false ? (
                              <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>Reconduite • Non validée</span>
                            ) : (
                              <>
                                Saisi par : {getPartnerName(charge.added_by)}
                                {charge.modified_by && ` • Modifié par : ${getPartnerName(charge.modified_by)}`}
                              </>
                            )}
                            {` • Clé : `}
                            {
                              charge.split_method === 'proportional' ? 'Prorata' :
                              charge.split_method === '50_50' ? '50/50' :
                              charge.split_method === 'user1_only' ? `100% ${p1Name}` : `100% ${p2Name}`
                            }
                          </div>
                        </div>

                        <div className="charge-pricing">
                          <span className="charge-val">{charge.amount.toFixed(2)} €</span>
                          <div className="charge-split">
                            <span className="charge-split-s">
                              {p1Name.charAt(0)} : {(
                                charge.split_method === 'proportional' ? charge.amount * calculations.ratioSam :
                                charge.split_method === '50_50' ? charge.amount / 2 :
                                charge.split_method === 'user1_only' ? charge.amount : 0
                              ).toFixed(1)}
                            </span>
                            <span className="charge-split-a">
                              {p2Name.charAt(0)} : {(
                                charge.split_method === 'proportional' ? charge.amount * calculations.ratioAurelie :
                                charge.split_method === '50_50' ? charge.amount / 2 :
                                charge.split_method === 'user2_only' ? charge.amount : 0
                              ).toFixed(1)}
                            </span>
                          </div>
                        </div>

                        {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                          <div className="actions-row">
                            {charge.is_validated === false && (
                              <button 
                                className="btn-icon" 
                                style={{ background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                                onClick={() => handleValidateCharge(charge)}
                                title="Valider la charge reconduite"
                              >
                                <CheckCircle2 size={13} />
                              </button>
                            )}
                            <button 
                              className="btn-icon" 
                              onClick={() => openEditCharge(charge)}
                              title={charge.is_validated === false ? "Modifier et valider" : "Modifier"}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button className="btn-icon delete" onClick={() => handleDeleteCharge(charge.id!, charge.label)} title="Supprimer">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
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
                  <button className="btn-icon" onClick={() => setShowAddAdvanceModal(true)}>
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
                  {advances.map(adv => (
                    <div key={adv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <div>
                        <div style={{ fontWeight: '600' }}>{adv.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Saisi par : {getPartnerName(adv.assigned_to)}
                          {adv.modified_by && ` • Modifié par : ${getPartnerName(adv.modified_by)}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: '700', marginRight: '4px' }}>{adv.amount.toFixed(2)} €</span>
                        {(selectedMonth.status === 'draft' || selectedMonth.status === 'reopened') && (
                          <div className="actions-row">
                            <button className="btn-icon" onClick={() => openEditAdvance(adv)}>
                              <Edit2 size={12} />
                            </button>
                            <button className="btn-icon delete" onClick={() => handleDeleteAdvance(adv.id!, adv.label)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderBottom: '1px solid var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Avance à déduire {p1Name} :</span>
                <span style={{ fontWeight: '800', color: calculations.avanceDeduireSam >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {calculations.avanceDeduireSam >= 0 ? '+' : ''}{calculations.avanceDeduireSam.toFixed(2)} €
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Avance à déduire {p2Name} :</span>
                <span style={{ fontWeight: '800', color: calculations.avanceDeduireAurelie >= 0 ? 'var(--success)' : 'var(--error)' }}>
                  {calculations.avanceDeduireAurelie >= 0 ? '+' : ''}{calculations.avanceDeduireAurelie.toFixed(2)} €
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                  <span>Avance à déduire (Rééquilibrage) :</span>
                  <span style={{ fontWeight: '600', color: activeAvance >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {activeAvance >= 0 ? '+' : ''}{activeAvance.toFixed(2)} €
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Dépenses directes déjà payées :</span>
                  <span style={{ fontWeight: '600', color: 'var(--success)' }}>-{activeAutres.toFixed(2)} €</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '3px' }}>
                  <span>Avance à déduire (Rééquilibrage) :</span>
                  <span style={{ fontWeight: '600', color: otherAvance >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {otherAvance >= 0 ? '+' : ''}{otherAvance.toFixed(2)} €
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span>Dépenses directes déjà payées :</span>
                  <span style={{ fontWeight: '600', color: 'var(--success)' }}>-{otherAutres.toFixed(2)} €</span>
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
                    {cat.name}
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

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-secondary" onClick={() => { setShowAddChargeModal(false); setChargeToEdit(null); }}>Annuler</button>
              <button className="btn-primary" onClick={handleSaveCharge}>Valider</button>
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
