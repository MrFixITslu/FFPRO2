
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BudgetEvent, EventItem, EVENT_ITEM_CATEGORIES, ProjectTask, ProjectFile, EventLog, Contact, User } from '../types';
import { saveFileToHardDrive, getFileFromHardDrive, triggerSecureDownload, saveInternalDoc, getInternalDoc } from '../services/fileStorageService';
import DocumentEditor from './DocumentEditor';
import ExcelEditor from './ExcelEditor';

const generateId = () => Math.random().toString(36).substr(2, 9);

type ProjectTab = 'ledger' | 'tasks' | 'vault' | 'team' | 'contacts' | 'log';

const MOCK_ONLINE_USERS: User[] = [
  { id: 'u1', name: 'nsv', role: 'admin', online: true },
  { id: 'u2', name: 'Sarah', role: 'collaborator', online: true },
  { id: 'u3', name: 'John', role: 'collaborator', online: true },
  { id: 'u4', name: 'Michael', role: 'collaborator', online: false },
];

interface Props {
  events: BudgetEvent[];
  contacts: Contact[];
  directoryHandle: FileSystemDirectoryHandle | null;
  currentUser: string;
  isAdmin: boolean;
  onAddEvent: (event: Omit<BudgetEvent, 'id' | 'items' | 'notes' | 'tasks' | 'files' | 'contactIds' | 'memberUsernames' | 'ious' | 'lastUpdated' | 'logs'>) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateEvent: (event: BudgetEvent) => void;
  onUpdateContacts: (contacts: Contact[]) => void;
  onMountVault?: () => void;
}

const EventPlanner: React.FC<Props> = ({ events, contacts, directoryHandle, currentUser, isAdmin, onAddEvent, onDeleteEvent, onUpdateEvent, onUpdateContacts, onMountVault }) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>('ledger');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  
  const [taskText, setTaskText] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [subTaskInputs, setSubTaskInputs] = useState<Record<string, string>>({});

  // Editor States
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [isEditingSheet, setIsEditingSheet] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<{ id?: string, title: string, content: string } | null>(null);

  // Contact States
  const [contactSearch, setContactSearch] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', number: '', email: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedEvent = useMemo(() => (events || []).find(e => e.id === selectedEventId), [events, selectedEventId]);

  const addActionLog = (event: BudgetEvent, action: string, type: EventLog['type']) => {
    const newLog: EventLog = {
      id: generateId(),
      action,
      timestamp: new Date().toISOString(),
      username: currentUser,
      type
    };
    onUpdateEvent({
      ...event,
      logs: [newLog, ...(event.logs || [])],
      lastUpdated: new Date().toISOString()
    });
  };

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEvent) return;
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const description = (formData.get('description') as string || '').trim();
    if (!description || isNaN(amount)) return;
    
    const newItem: EventItem = {
      id: generateId(),
      description,
      amount,
      type: formData.get('type') as 'income' | 'expense',
      category: formData.get('category') as string,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedEvent = { ...selectedEvent, items: [...(selectedEvent.items || []), newItem] };
    addActionLog(updatedEvent, `Added ${newItem.type}: "${description}" ($${amount})`, 'transaction');
    e.currentTarget.reset();
  };

  const handleAddTask = () => {
    if (!selectedEvent || !taskText.trim()) return;
    const newTask: ProjectTask = {
      id: generateId(),
      text: taskText.trim(),
      completed: false,
      assignedToId: currentUser,
      subTasks: []
    };
    const updatedEvent = { ...selectedEvent, tasks: [...(selectedEvent.tasks || []), newTask] };
    addActionLog(updatedEvent, `Deployed milestone: "${newTask.text}"`, 'task');
    setTaskText('');
  };

  const handleAddSubTask = (parentTaskId: string) => {
    const text = subTaskInputs[parentTaskId];
    if (!selectedEvent || !text?.trim()) return;

    const newSubTask: ProjectTask = {
      id: generateId(),
      text: text.trim(),
      completed: false,
      assignedToId: currentUser,
      subTasks: []
    };

    const updatedTasks = (selectedEvent.tasks || []).map(t => {
      if (t.id === parentTaskId) {
        return { ...t, subTasks: [...(t.subTasks || []), newSubTask] };
      }
      return t;
    });

    const updatedEvent = { ...selectedEvent, tasks: updatedTasks };
    addActionLog(updatedEvent, `Linked sub-milestone to "${parentTaskId}": "${newSubTask.text}"`, 'task');
    setSubTaskInputs(prev => ({ ...prev, [parentTaskId]: '' }));
  };

  const toggleTaskCompletion = (taskId: string, parentTaskId?: string) => {
    if (!selectedEvent) return;
    
    let updatedTasks: ProjectTask[];
    if (parentTaskId) {
      updatedTasks = (selectedEvent.tasks || []).map(t => {
        if (t.id === parentTaskId) {
          return {
            ...t,
            subTasks: (t.subTasks || []).map(st => st.id === taskId ? { ...st, completed: !st.completed } : st)
          };
        }
        return t;
      });
    } else {
      updatedTasks = (selectedEvent.tasks || []).map(t => 
        t.id === taskId ? { ...t, completed: !t.completed } : t
      );
    }
    
    onUpdateEvent({ ...selectedEvent, tasks: updatedTasks });
  };

  const handleAddMember = () => {
    if (!selectedEvent || !inviteUsername.trim()) return;
    const currentMembers = selectedEvent.memberUsernames || [];
    if (currentMembers.includes(inviteUsername.trim())) return;
    
    const updatedEvent = { 
      ...selectedEvent, 
      memberUsernames: [...currentMembers, inviteUsername.trim()] 
    };
    addActionLog(updatedEvent, `Authorized user "${inviteUsername.trim()}"`, 'team');
    setInviteUsername('');
  };

  const handleLinkContact = (contactId: string) => {
    if (!selectedEvent) return;
    const currentIds = selectedEvent.contactIds || [];
    if (currentIds.includes(contactId)) return;

    const updatedEvent = { ...selectedEvent, contactIds: [...currentIds, contactId] };
    const contact = contacts.find(c => c.id === contactId);
    addActionLog(updatedEvent, `Linked stakeholder: "${contact?.name || 'Unknown'}"`, 'contact');
    onUpdateEvent(updatedEvent);
  };

  const handleUnlinkContact = (contactId: string) => {
    if (!selectedEvent) return;
    const updatedEvent = { 
      ...selectedEvent, 
      contactIds: (selectedEvent.contactIds || []).filter(id => id !== contactId) 
    };
    const contact = contacts.find(c => c.id === contactId);
    addActionLog(updatedEvent, `Removed stakeholder: "${contact?.name || 'Unknown'}"`, 'contact');
    onUpdateEvent(updatedEvent);
  };

  const handleCreateContact = () => {
    if (!newContact.name) return;
    const contact: Contact = { ...newContact, id: generateId() };
    onUpdateContacts([...contacts, contact]);
    if (selectedEvent) handleLinkContact(contact.id);
    setNewContact({ name: '', number: '', email: '' });
    setShowContactForm(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!selectedEvent || !file) return;

    if (!directoryHandle) {
      alert("Hard Drive Vault not linked. Mirroring unavailable.");
      return;
    }

    try {
      const storageRef = await saveFileToHardDrive(directoryHandle, selectedEvent.name, file.name, file);
      const newFile: ProjectFile = {
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        timestamp: new Date().toISOString(),
        storageRef,
        storageType: 'filesystem',
        version: 1,
        lastModifiedBy: currentUser
      };
      
      const updatedEvent = { ...selectedEvent, files: [...(selectedEvent.files || []), newFile] };
      onUpdateEvent(updatedEvent);
      addActionLog(updatedEvent, `Linked local asset: "${file.name}"`, 'file');
    } catch (err: any) {
      console.error("Vault access error:", err);
      alert(`Vault Access Failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleSaveDocument = async (title: string, content: string, extension: '.fdoc' | '.fcel' = '.fdoc') => {
    if (!selectedEvent) return;
    
    const docId = currentDoc?.id || generateId();
    const fileName = `${title.trim().replace(/[^a-z0-9]/gi, '_')}${extension}`;

    try {
      await saveInternalDoc(docId, content);

      let storageRef = `internal/${docId}`;
      let storageType: 'indexeddb' | 'filesystem' = 'indexeddb';

      if (directoryHandle) {
        try {
          const blob = new Blob([content], { type: 'text/html' });
          storageRef = await saveFileToHardDrive(directoryHandle, selectedEvent.name, fileName, blob);
          storageType = 'filesystem';
        } catch (mirrorErr) {
          console.warn("Mirroring failed.");
        }
      }

      let updatedFiles = [...(selectedEvent.files || [])];
      const existingFile = updatedFiles.find(f => f.id === docId);

      if (existingFile) {
        updatedFiles = updatedFiles.map(f => f.id === docId ? {
          ...f,
          name: fileName,
          timestamp: new Date().toISOString(),
          lastModifiedBy: currentUser,
          version: (f.version || 1) + 1,
          storageRef,
          storageType
        } : f);
      } else {
        const newFile: ProjectFile = {
          id: docId,
          name: fileName,
          type: extension === '.fdoc' ? 'application/fire-doc' : 'application/fire-cell',
          size: content.length,
          timestamp: new Date().toISOString(),
          storageRef,
          storageType,
          version: 1,
          lastModifiedBy: currentUser
        };
        updatedFiles.push(newFile);
      }

      const updatedEvent = { 
        ...selectedEvent, 
        files: updatedFiles,
        lastUpdated: new Date().toISOString()
      };
      
      onUpdateEvent(updatedEvent); 
      addActionLog(updatedEvent, `Vault Commit: "${fileName}"`, 'file');
      setCurrentDoc({ id: docId, title, content });
    } catch (err: any) {
      alert(`Save Failure: ${err.message}`);
      throw err;
    }
  };

  const handleAssetClick = async (file: ProjectFile) => {
    const isDoc = file.name.endsWith('.fdoc') || file.type === 'application/fire-doc';
    const isSheet = file.name.endsWith('.fcel') || file.type === 'application/fire-cell';
    
    if (isDoc || isSheet) {
      try {
        let content = await getInternalDoc(file.id);
        if (!content && directoryHandle && file.storageType === 'filesystem') {
          const blob = await getFileFromHardDrive(directoryHandle, file.storageRef);
          content = await blob.text();
        }

        if (content) {
          setCurrentDoc({ id: file.id, title: file.name.replace(/\.(fdoc|fcel)$/, ''), content });
          if (isDoc) setIsEditingDoc(true);
          else setIsEditingSheet(true);
        } else {
          throw new Error("Asset missing.");
        }
      } catch (err) {
        alert("Retrieval Error.");
      }
      return;
    }

    if (file.storageType === 'url') {
      window.open(file.storageRef, '_blank');
      return;
    }

    if (file.storageType === 'filesystem') {
      if (!directoryHandle) {
        alert("SSD Mirror Disconnected.");
        return;
      }
      try {
        const blob = await getFileFromHardDrive(directoryHandle, file.storageRef);
        triggerSecureDownload(blob, file.name);
      } catch (err: any) {
        alert(`Access Denied.`);
      }
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto px-2">
      {isEditingDoc && (
        <DocumentEditor 
          initialTitle={currentDoc?.title || "Draft"}
          initialContent={currentDoc?.content || ""}
          onSave={(t, c) => handleSaveDocument(t, c, '.fdoc')}
          onClose={() => { setIsEditingDoc(false); setCurrentDoc(null); }}
          isVaultMounted={!!directoryHandle}
          onMountVault={onMountVault}
        />
      )}

      {isEditingSheet && (
        <ExcelEditor 
          initialTitle={currentDoc?.title || "Sheet"}
          initialData={currentDoc?.content || ""}
          onSave={(t, d) => handleSaveDocument(t, d, '.fcel')}
          onClose={() => { setIsEditingSheet(false); setCurrentDoc(null); }}
          isVaultMounted={!!directoryHandle}
          onMountVault={onMountVault}
        />
      )}

      {/* STORAGE INDICATOR */}
      <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-850 mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            {MOCK_ONLINE_USERS.filter(u => u.online).map(u => (
              <div key={u.id} className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold uppercase text-white shadow-sm">
                {u.name[0]}
              </div>
            ))}
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Storage Node</span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded">
              {directoryHandle ? `MIRROR: ${directoryHandle.name}` : 'INTERNAL VAULT ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-light tracking-tight text-slate-800">Projects</h2>
        {isAdmin && !selectedEventId && (
          <button onClick={() => setShowAddForm(!showAddForm)} className="px-4 py-2 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-indigo-500 transition-all">
            {showAddForm ? 'Cancel' : 'Initiate Framework'}
          </button>
        )}
      </div>

      {showAddForm && !selectedEventId && (
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm animate-in zoom-in-95 mb-6">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project Designation..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 text-slate-850 rounded outline-none font-semibold text-base focus:ring-1 focus:ring-indigo-500" />
          <button onClick={() => { if (!newName) return; onAddEvent({ name: newName, date: new Date().toISOString().split('T')[0], status: 'active' }); setShowAddForm(false); setNewName(''); }} className="w-full mt-4 py-2 bg-indigo-600 text-white font-bold rounded shadow-sm uppercase tracking-wider text-[11px] hover:bg-indigo-500 transition-all">Deploy Project</button>
        </div>
      )}

      {selectedEventId && selectedEvent ? (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6 bg-indigo-600 p-5 rounded-xl shadow-sm overflow-hidden relative">
             <div className="flex items-center gap-4 relative z-10">
               <button onClick={() => setSelectedEventId(null)} className="w-10 h-10 flex items-center justify-center bg-white/10 text-white rounded hover:bg-white/20 transition-all border border-white/5 shadow-sm"><i className="fas fa-chevron-left text-xs"></i></button>
               <div>
                 <h2 className="text-2xl font-bold text-white tracking-tight leading-none">{selectedEvent.name}</h2>
                 <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider mt-1.5">Strategic Intelligence</p>
               </div>
              </div>
             <div className="flex bg-black/20 p-1 rounded-lg border border-white/10 overflow-x-auto no-scrollbar relative z-10 backdrop-blur-md">
               {(['ledger', 'tasks', 'vault', 'team', 'contacts', 'log'] as ProjectTab[]).map(tab => (
                 <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>{tab}</button>
               ))}
             </div>
          </div>

          <div className="min-h-[500px]">
            {activeTab === 'vault' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-[500px]">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Encrypted Vault Assets</h3>
                    <div className="flex gap-2">
                      <button onClick={() => { setIsEditingSheet(true); setCurrentDoc(null); }} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-emerald-500 transition">
                        <i className="fas fa-table mr-1.5"></i> New Sheet
                      </button>
                      <button onClick={() => { setIsEditingDoc(true); setCurrentDoc(null); }} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-indigo-500 transition">
                        <i className="fas fa-file-pen mr-1.5"></i> New Doc
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                    {(selectedEvent.files || []).map(file => {
                      const isSheet = file.name.endsWith('.fcel') || file.type === 'application/fire-cell';
                      const isDoc = file.name.endsWith('.fdoc') || file.type === 'application/fire-doc';
                      const isInternal = file.storageType === 'indexeddb';
                      
                      return (
                        <div key={file.id} className="p-5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center text-center group cursor-pointer hover:border-indigo-500 transition-all shadow-sm" onClick={() => handleAssetClick(file)}>
                          <div className={`w-12 h-12 rounded flex items-center justify-center shadow-sm mb-4 group-hover:scale-105 transition-transform ${isSheet ? 'bg-emerald-600 text-white' : (isDoc ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-slate-250')}`}>
                            <i className={`fas ${isSheet ? 'fa-table' : (isDoc ? 'fa-file-lines' : 'fa-file-invoice')} text-lg`}></i>
                          </div>
                          <p className="font-bold text-[11px] text-slate-800 truncate w-full mb-1">{file.name}</p>
                          <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded ${isInternal ? 'bg-indigo-50 text-indigo-500 border border-indigo-100' : 'bg-emerald-50 text-emerald-500 border border-emerald-100'}`}>
                            {isInternal ? 'SECURE_VAULT' : 'MIRROR_DRIVE'}
                          </span>
                        </div>
                      );
                    })}
                    <div className="p-5 border border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer transition-all" onClick={() => fileInputRef.current?.click()}>
                      <i className="fas fa-file-circle-plus text-lg mb-2"></i>
                      <span className="text-[9px] font-bold uppercase tracking-wider">Link Physical</span>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'ledger' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-6">Internal Finance</h3>
                  <div className="space-y-3">
                    {selectedEvent.items.length > 0 ? selectedEvent.items.map(item => (
                      <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded flex items-center justify-center text-white ${item.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                            <i className={`fas ${item.type === 'income' ? 'fa-plus' : 'fa-minus'} text-xs`}></i>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{item.description}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{item.category} • {item.date}</p>
                          </div>
                        </div>
                        <p className={`font-bold text-sm ${item.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                        </p>
                      </div>
                    )) : <p className="text-center py-10 text-slate-355 uppercase font-bold text-[10px] tracking-wider">No Transactions</p>}
                  </div>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-sm">
                  <h3 className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 mb-6">Authorize Entry</h3>
                  <form onSubmit={handleAddItem} className="space-y-4">
                    <input name="description" placeholder="Description" required className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500" />
                    <input name="amount" type="number" step="0.01" placeholder="Amount" required className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500" />
                    <select name="type" className="w-full bg-slate-850 border border-white/10 rounded px-3 py-2 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300">
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                    <select name="category" className="w-full bg-slate-850 border border-white/10 rounded px-3 py-2 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300">
                      {EVENT_ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider">Commit Entry</button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {(selectedEvent.tasks || []).length > 0 ? (selectedEvent.tasks || []).map(task => (
                    <div key={task.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => toggleTaskCompletion(task.id)}
                            className={`w-8 h-8 rounded flex items-center justify-center border transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-slate-300 hover:border-indigo-400'}`}
                          >
                            <i className="fas fa-check text-xs"></i>
                          </button>
                          <div>
                            <p className={`font-semibold text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.text}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned: {task.assignedToId}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Subtasks */}
                      <div className="ml-11 space-y-2">
                        {(task.subTasks || []).map(st => (
                          <div key={st.id} className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleTaskCompletion(st.id, task.id)}
                              className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${st.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-slate-250'}`}
                            >
                              <i className="fas fa-check text-[7px]"></i>
                            </button>
                            <p className={`text-xs font-medium ${st.completed ? 'text-slate-400 line-through' : 'text-slate-600'}`}>{st.text}</p>
                          </div>
                        ))}
                        <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
                          <input 
                            type="text" 
                            placeholder="Link sub-milestone..."
                            value={subTaskInputs[task.id] || ''}
                            onChange={(e) => setSubTaskInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask(task.id)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button 
                            onClick={() => handleAddSubTask(task.id)}
                            className="w-8 h-8 bg-slate-900 text-white rounded flex items-center justify-center text-[10px] font-bold"
                          >
                            <i className="fas fa-plus text-xs"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="bg-white p-12 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
                      <i className="fas fa-clipboard-list text-slate-200 text-4xl mb-4"></i>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Active Phases</p>
                    </div>
                  )}
                </div>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
                   <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-4">Deploy Milestone</h3>
                   <textarea 
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    placeholder="Enter project milestone..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500 h-28 mb-3"
                   />
                   <button 
                    onClick={handleAddTask}
                    className="w-full py-2 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm"
                   >
                    Initialize Phase
                   </button>
                </div>
               </div>
            )}

            {activeTab === 'team' && (
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(selectedEvent.memberUsernames || []).map(username => (
                    <div key={username} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center font-bold uppercase border border-indigo-150">
                          {username[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{username}</p>
                          <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Authorized Access</span>
                        </div>
                      </div>
                      <button className="text-slate-300 hover:text-rose-500 transition-colors"><i className="fas fa-user-minus text-xs"></i></button>
                    </div>
                  ))}
                  <div className="bg-slate-50 border border-dashed border-slate-250 rounded-xl p-4 flex flex-col items-center justify-center text-center opacity-60">
                     <i className="fas fa-user-plus text-slate-300 text-lg mb-1"></i>
                     <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Awaiting Recruitment</p>
                  </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-sm h-fit">
                   <h3 className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 mb-4">Project Access Control</h3>
                   <p className="text-xs text-slate-400 mb-4 font-medium">Add collaborators by their vault identity to grant them shared intelligence access.</p>
                   <input 
                    type="text" 
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Search designation..."
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
                   />
                   <button 
                    onClick={handleAddMember}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider"
                   >
                    Link Identity
                   </button>
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">Linked Stakeholders</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {contacts.filter(c => (selectedEvent.contactIds || []).includes(c.id)).map(contact => (
                        <div key={contact.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white border border-slate-250 rounded flex items-center justify-center text-indigo-600 shadow-sm"><i className="fas fa-id-badge text-sm"></i></div>
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{contact.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{contact.number}</p>
                            </div>
                          </div>
                          <button onClick={() => handleUnlinkContact(contact.id)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><i className="fas fa-unlink text-xs"></i></button>
                        </div>
                      ))}
                      {contacts.filter(c => (selectedEvent.contactIds || []).includes(c.id)).length === 0 && (
                        <p className="col-span-2 py-8 text-center text-slate-300 uppercase font-bold text-[9px] tracking-wider">No Stakeholders Linked</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Global Stakeholder Directory</h3>
                      <input 
                        type="text" 
                        placeholder="Search directory..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-500 w-48"
                      />
                    </div>
                    <div className="space-y-2">
                      {contacts.filter(c => !(selectedEvent.contactIds || []).includes(c.id) && c.name.toLowerCase().includes(contactSearch.toLowerCase())).map(contact => (
                        <div key={contact.id} className="p-3 bg-white border border-slate-150 rounded-lg flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-indigo-50 text-indigo-400 rounded flex items-center justify-center border border-indigo-100"><i className="fas fa-user text-[10px]"></i></div>
                            <span className="text-xs font-semibold text-slate-700">{contact.name}</span>
                          </div>
                          <button onClick={() => handleLinkContact(contact.id)} className="px-3 py-1 bg-indigo-600 text-white rounded text-[8px] font-bold uppercase tracking-wider">Link Project</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 text-white shadow-sm h-fit">
                   <h3 className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 mb-4">Register Stakeholder</h3>
                   <div className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Stakeholder Name" 
                        value={newContact.name} 
                        onChange={e => setNewContact({...newContact, name: e.target.value})} 
                        className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                      <input 
                        type="text" 
                        placeholder="Contact Number" 
                        value={newContact.number} 
                        onChange={e => setNewContact({...newContact, number: e.target.value})} 
                        className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                      <input 
                        type="email" 
                        placeholder="Stakeholder Email" 
                        value={newContact.email} 
                        onChange={e => setNewContact({...newContact, email: e.target.value})} 
                        className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm font-semibold outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                      <button 
                        onClick={handleCreateContact}
                        className="w-full py-2.5 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-wider"
                      >
                        Commit to Vault
                      </button>
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'log' && (
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-6">Project Intelligence Feed</h3>
                <div className="space-y-6 relative">
                   <div className="absolute left-[15px] top-0 bottom-0 w-0.5 bg-slate-100"></div>
                   {(selectedEvent.logs || []).length > 0 ? (selectedEvent.logs || []).map(log => (
                     <div key={log.id} className="flex gap-4 relative z-10">
                        <div className={`w-8 h-8 rounded flex items-center justify-center text-xs shadow-sm ${
                          log.type === 'transaction' ? 'bg-emerald-600 text-white' : 
                          log.type === 'task' ? 'bg-indigo-600 text-white' : 
                          log.type === 'file' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <i className={`fas ${
                            log.type === 'transaction' ? 'fa-receipt' : 
                            log.type === 'task' ? 'fa-check-double' : 
                            log.type === 'file' ? 'fa-database' : 'fa-info'
                          } text-xs`}></i>
                        </div>
                        <div className="flex-1 pt-0.5">
                          <div className="flex justify-between items-start mb-0.5">
                            <p className="font-semibold text-slate-800 text-sm leading-none">{log.action}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {log.username} • {new Date(log.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                     </div>
                   )) : (
                     <p className="text-center py-12 text-slate-200 uppercase font-bold text-xs tracking-wider">Feed Empty</p>
                   )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
           {events.map(event => (
              <div key={event.id} onClick={() => setSelectedEventId(event.id)} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-600/50 hover:bg-slate-50/50 transition-all relative overflow-hidden group">
                <h3 className="font-bold text-slate-800 text-lg mb-2 group-hover:text-indigo-600 transition-colors">{event.name}</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-6">Updated: {new Date(event.lastUpdated).toLocaleDateString()}</p>
                <div className="flex gap-2">
                  <span className="px-3 py-1.5 rounded text-[8px] font-bold uppercase tracking-wider border bg-indigo-50 border-indigo-100 text-indigo-600">{(event.files || []).length} Assets</span>
                  <span className="px-3 py-1.5 rounded text-[8px] font-bold uppercase tracking-wider border bg-slate-50 border-slate-100 text-slate-600">{(event.tasks || []).length} Phases</span>
                </div>
              </div>
           ))}
        </div>
      )}
    </div>
  );
};

export default EventPlanner;
