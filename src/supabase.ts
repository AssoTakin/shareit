import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Création du client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Interfaces TypeScript correspondant aux tables Supabase
export interface Household {
  id: string;
  name: string;
  partner1_name: string;
  partner2_name: string;
  partner1_salary_default: number;
  partner2_salary_default: number;
  created_at?: string;
}

export interface Category {
  id: string;
  household_id: string | null;
  name: string;
  display_order: number;
  is_default: boolean;
}

export interface MonthEntity {
  id: string;
  household_id: string;
  year: number;
  month: number;
  salary_user1: number;
  salary_user2: number;
  status: string; // 'draft', 'pending_close', 'closed', 'reopened'
  close_requested_by: string | null;
  close_requested_at: string | null;
  closed_at: string | null;
  created_at?: string;
}

export interface Charge {
  id?: string;
  month_id: string;
  category_id: string;
  label: string;
  amount: number;
  split_method: string; // 'proportional', '50_50', 'user1_only', 'user2_only'
  is_recurring: boolean;
  added_by: string; // 'partner1' or 'partner2'
  modified_by?: string | null;
  is_validated?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Advance {
  id?: string;
  month_id: string;
  assigned_to: string; // 'partner1' or 'partner2'
  amount: number;
  label: string;
  modified_by?: string | null;
  created_at?: string;
}

export interface Template {
  id?: string;
  household_id: string;
  category_id: string;
  label: string;
  default_amount: number;
  split_method: string;
  is_active: boolean;
  created_at?: string;
}

// Vérifier si la configuration de Supabase est complète
export const isSupabaseConfigured = () => {
  return (
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-supabase-project') &&
    !supabaseAnonKey.includes('your-supabase-anon-key')
  );
};

// --- MÉTHODES D'API POUR LA BASE DE DONNÉES ---

// 1. Households
export async function getHousehold(id: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('id', id.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertHousehold(hh: Household): Promise<Household> {
  const { data, error } = await supabase
    .from('households')
    .insert([hh])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHousehold(hh: Household): Promise<Household> {
  const { data, error } = await supabase
    .from('households')
    .update({
      name: hh.name,
      partner1_name: hh.partner1_name,
      partner2_name: hh.partner2_name,
      partner1_salary_default: hh.partner1_salary_default,
      partner2_salary_default: hh.partner2_salary_default,
    })
    .eq('id', hh.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 2. Categories
export async function getCategories(householdId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertCategory(cat: Category): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert([cat])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(cat: Category): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ name: cat.name })
    .eq('id', cat.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// 3. Months
export async function getMonths(householdId: string): Promise<MonthEntity[]> {
  const { data, error } = await supabase
    .from('months')
    .select('*')
    .eq('household_id', householdId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function insertMonth(month: MonthEntity): Promise<MonthEntity> {
  const { data, error } = await supabase
    .from('months')
    .insert([month])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMonth(month: MonthEntity): Promise<MonthEntity> {
  const { data, error } = await supabase
    .from('months')
    .update({
      salary_user1: month.salary_user1,
      salary_user2: month.salary_user2,
      status: month.status,
      close_requested_by: month.close_requested_by,
      close_requested_at: month.close_requested_at,
      closed_at: month.closed_at,
    })
    .eq('id', month.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 4. Charges
export async function getCharges(monthId: string): Promise<Charge[]> {
  const { data, error } = await supabase
    .from('charges')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertCharge(charge: Charge): Promise<Charge> {
  const { data, error } = await supabase
    .from('charges')
    .insert([charge])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCharge(charge: Charge): Promise<Charge> {
  const { data, error } = await supabase
    .from('charges')
    .update({
      label: charge.label,
      amount: charge.amount,
      category_id: charge.category_id,
      split_method: charge.split_method,
      is_recurring: charge.is_recurring,
      modified_by: charge.modified_by,
      is_validated: charge.is_validated,
      updated_at: new Date().toISOString(),
    })
    .eq('id', charge.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await supabase.from('charges').delete().eq('id', id);
  if (error) throw error;
}

// 5. Advances
export async function getAdvances(monthId: string): Promise<Advance[]> {
  const { data, error } = await supabase
    .from('advances')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertAdvance(adv: Advance): Promise<Advance> {
  const { data, error } = await supabase
    .from('advances')
    .insert([adv])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAdvance(id: string): Promise<void> {
  const { error } = await supabase.from('advances').delete().eq('id', id);
  if (error) throw error;
}

export async function updateAdvance(adv: Advance): Promise<Advance> {
  const { data, error } = await supabase
    .from('advances')
    .update({
      amount: adv.amount,
      label: adv.label,
      assigned_to: adv.assigned_to,
      modified_by: adv.modified_by,
    })
    .eq('id', adv.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 6. Templates
export async function getTemplates(householdId: string): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertTemplate(t: Template): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .insert([t])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplate(t: Template): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .update({ is_active: t.is_active })
    .eq('id', t.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

// --- INITIALISER UN NOUVEAU MOIS AVEC MODÈLES ---
export async function createNewMonth(householdId: string, year: number, monthNumber: number): Promise<MonthEntity> {
  const monthId = `${householdId}_${year}_${monthNumber}`;
  
  // 1. Charger les infos du foyer
  const hh = await getHousehold(householdId);
  const salary1 = hh?.partner1_salary_default || 2500;
  const salary2 = hh?.partner2_salary_default || 2100;

  // 2. Créer l'entité mois
  const newMonth: MonthEntity = {
    id: monthId,
    household_id: householdId,
    year,
    month: monthNumber,
    salary_user1: salary1,
    salary_user2: salary2,
    status: 'draft',
    close_requested_by: null,
    close_requested_at: null,
    closed_at: null
  };
  
  const createdMonth = await insertMonth(newMonth);

  // 3. Essayer de charger les charges du mois précédent chronologique (catégories 'basiques' et 'maia')
  let prevYear = year;
  let prevMonthNum = monthNumber - 1;
  if (prevMonthNum === 0) {
    prevMonthNum = 12;
    prevYear = year - 1;
  }
  const prevMonthId = `${householdId}_${prevYear}_${prevMonthNum}`;
  
  let { data: chargesToCopy, error: prevError } = await supabase
    .from('charges')
    .select('*')
    .eq('month_id', prevMonthId)
    .in('category_id', ['basiques', 'maia']);

  // Si aucun enregistrement chronologique direct, essayer de prendre le dernier mois existant
  if (prevError || !chargesToCopy || chargesToCopy.length === 0) {
    const { data: latestMonthArr } = await supabase
      .from('months')
      .select('id')
      .eq('household_id', householdId)
      .neq('id', monthId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1);

    if (latestMonthArr && latestMonthArr.length > 0) {
      const { data: latestCharges } = await supabase
        .from('charges')
        .select('*')
        .eq('month_id', latestMonthArr[0].id)
        .in('category_id', ['basiques', 'maia']);
      if (latestCharges && latestCharges.length > 0) {
        chargesToCopy = latestCharges;
      }
    }
  }

  // Insérer les charges copiées (avec is_validated = false)
  if (chargesToCopy && chargesToCopy.length > 0) {
    const chargesToInsert = chargesToCopy.map(c => ({
      month_id: monthId,
      category_id: c.category_id,
      label: c.label,
      amount: c.amount,
      split_method: c.split_method,
      is_recurring: c.is_recurring,
      added_by: c.added_by,
      modified_by: c.modified_by || null,
      is_validated: false
    }));
    const { error: insertError } = await supabase.from('charges').insert(chargesToInsert);
    if (insertError) throw insertError;
  } else {
    // Scaffold initial si aucun mois précédent ou historique n'existe
    const defaultCharges = [
      { month_id: monthId, category_id: 'basiques', label: 'Loyer', amount: 1200.0, split_method: 'proportional', is_recurring: true, added_by: 'partner1', modified_by: null, is_validated: false },
      { month_id: monthId, category_id: 'basiques', label: 'Alimentation', amount: 400.0, split_method: '50_50', is_recurring: true, added_by: 'partner2', modified_by: null, is_validated: false },
      { month_id: monthId, category_id: 'basiques', label: 'EDF/GDF', amount: 100.10, split_method: '50_50', is_recurring: true, added_by: 'partner1', modified_by: null, is_validated: false },
      { month_id: monthId, category_id: 'maia', label: 'Nounou / Crèche', amount: 350.0, split_method: 'proportional', is_recurring: true, added_by: 'partner1', modified_by: null, is_validated: false }
    ];
    const { error: insertError } = await supabase.from('charges').insert(defaultCharges);
    if (insertError) throw insertError;
  }

  return createdMonth;
}

// --- IMPORT DE L'HISTORIQUE DE DÉMO (PEROUSE.XLSX) ---
export async function importDemoHistory(householdId: string): Promise<void> {
  // Supprimer d'abord les mois existants du foyer pour éviter les doublons lors du rechargement
  const { error: deleteMonthsError } = await supabase
    .from('months')
    .delete()
    .eq('household_id', householdId);
  if (deleteMonthsError) throw deleteMonthsError;

  const monthsToInsert: MonthEntity[] = [];
  const chargesToInsert: any[] = [];
  const advancesToInsert: any[] = [];

  // Période de Septembre 2024 (m = 9) à Mai 2026 (m = 5)
  let year = 2024;
  let month = 9;

  while (year < 2026 || (year === 2026 && month <= 5)) {
    const monthId = `${householdId}_${year}_${month}`;
    const isClosed = year < 2026 || (year === 2026 && month < 5);

    // Ajustement dynamique des salaires
    const salary1 = 2800.0 + (month * 20 - 100);
    const salary2 = 2080.0 + (month * 10 - 50);

    monthsToInsert.push({
      id: monthId,
      household_id: householdId,
      year,
      month,
      salary_user1: salary1,
      salary_user2: salary2,
      status: isClosed ? 'closed' : 'draft',
      close_requested_by: null,
      close_requested_at: null,
      closed_at: isClosed ? new Date().toISOString() : null
    });

    // Variations mensuelles réalistes
    const rentAmt = 1207.0 + (month % 3) * 15.0;
    const foodAmt = 380.0 + (month * 12.5) % 110.0;
    const edfAmt = 85.0 + (month === 12 || month <= 3 ? 45.10 : 10.10);
    const nannyAmt = month === 8 ? 0.0 : (320.0 + (month % 2) * 50.0);
    const insuranceAmt = 45.0;

    const baseCharges = [
      { month_id: monthId, category_id: 'basiques', label: 'Loyer', amount: rentAmt, split_method: 'proportional', is_recurring: true, added_by: 'partner1' },
      { month_id: monthId, category_id: 'basiques', label: 'Alimentation', amount: foodAmt, split_method: '50_50', is_recurring: true, added_by: 'partner2' },
      { month_id: monthId, category_id: 'basiques', label: 'EDF/GDF', amount: edfAmt, split_method: '50_50', is_recurring: true, added_by: 'partner1' },
      { month_id: monthId, category_id: 'basiques', label: 'Assurance Maison', amount: insuranceAmt, split_method: '50_50', is_recurring: true, added_by: 'partner2' },
      
      { month_id: monthId, category_id: 'maia', label: 'Nounou / Crèche', amount: nannyAmt, split_method: 'proportional', is_recurring: true, added_by: 'partner1' },
      { month_id: monthId, category_id: 'maia', label: 'Cantine', amount: 60.0 + (month * 4) % 30.0, split_method: 'proportional', is_recurring: true, added_by: 'partner2' },
      
      { month_id: monthId, category_id: 'autres', label: 'Abonnement Free', amount: 39.99, split_method: '50_50', is_recurring: true, added_by: 'partner2' },
    ];

    if (month % 4 === 0) {
      baseCharges.push({
        month_id: monthId,
        category_id: 'autres',
        label: 'Achat ponctuel (Dyson / Ikea)',
        amount: 250.0,
        split_method: 'user1_only',
        is_recurring: false,
        added_by: 'partner1'
      });
    }

    chargesToInsert.push(...baseCharges.filter(c => c.amount > 0));

    // Simulation d'avances de frais
    if (month % 2 === 0) {
      advancesToInsert.push({
        month_id: monthId,
        assigned_to: 'partner1',
        amount: 45.0 + (month * 5) % 80,
        label: 'Transport commun / SNCF'
      });
    }
    if (month % 3 === 0) {
      advancesToInsert.push({
        month_id: monthId,
        assigned_to: 'partner2',
        amount: 30.0 + (month * 2) % 40,
        label: 'Pharmacie & Vêtements bébé'
      });
    }

    // Incrémenter le mois
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  // Insertion en masse
  const { error: monthErr } = await supabase.from('months').insert(monthsToInsert);
  if (monthErr) throw monthErr;

  const { error: chargeErr } = await supabase.from('charges').insert(chargesToInsert);
  if (chargeErr) throw chargeErr;

  if (advancesToInsert.length > 0) {
    const { error: advErr } = await supabase.from('advances').insert(advancesToInsert);
    if (advErr) throw advErr;
  }
}

// --- LOGS D'ACTIVITÉS (NOTIFICATIONS HORS-LIGNE) ---
export interface ActivityLog {
  id?: string;
  household_id: string;
  actor: string;
  action_type: string; // 'create', 'update', 'delete', 'validate', 'propose_close', 'close', 'reject_close', 'reopen', 'rename_household'
  item_type: string; // 'charge', 'advance', 'month', 'category', 'household'
  item_label: string;
  details?: string | null;
  created_at?: string;
}

export async function insertActivityLog(
  householdId: string,
  actor: string,
  actionType: string,
  itemType: string,
  itemLabel: string,
  details?: string | null
): Promise<void> {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      household_id: householdId,
      actor,
      action_type: actionType,
      item_type: itemType,
      item_label: itemLabel,
      details: details || null
    });
    if (error) {
      console.warn("Could not insert activity log (table activity_logs might not exist yet):", error.message);
    }
  } catch (err) {
    console.warn("Exception during insert activity log (table activity_logs might not exist yet):", err);
  }
}

export async function getActivityLogs(householdId: string, limit = 30): Promise<ActivityLog[]> {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("Could not fetch activity logs (table activity_logs might not exist yet):", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Exception during fetch activity logs (table activity_logs might not exist yet):", err);
    return [];
  }
}
