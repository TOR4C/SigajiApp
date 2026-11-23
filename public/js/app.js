// --- PWA & INIT ---
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); }); }
let deferredPrompt; const installBtn = document.getElementById('install-app-btn');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if(installBtn) installBtn.classList.remove('hidden'); });
async function installPWA() { if (!deferredPrompt) return; deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; deferredPrompt = null; if(outcome === 'accepted' && installBtn) installBtn.classList.add('hidden'); }

// --- DATA STORE ---
let db = {
    positions: JSON.parse(localStorage.getItem('positions')) || [],
    employees: JSON.parse(localStorage.getItem('employees')) || [],
    holidays: JSON.parse(localStorage.getItem('holidays')) || [],
    kasbon: JSON.parse(localStorage.getItem('kasbon')) || [],
    bonuses: JSON.parse(localStorage.getItem('bonuses')) || [],
    attendance: JSON.parse(localStorage.getItem('attendance')) || [],
    _tomb: JSON.parse(localStorage.getItem('_tomb')) || {},
    profile: JSON.parse(localStorage.getItem('profile')) || { name: "My Company", owner: "Owner", address: "Indonesia", phone: "08123456789" }
};

const persist = () => { for(let k in db) localStorage.setItem(k, JSON.stringify(db[k])); };
const save = () => { Cloud.stampDb(db); persist(); Cloud.schedule(); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.refreshView = () => { const s = document.querySelector('.section:not(.hidden)'); if (s) nav(s.id, false); };
window.skeletonLists = () => { // hanya saat data lokal kosong (mis. login di perangkat baru), agar data yang sudah ada tidak berkedip
  if (db.employees.length || db.positions.length) return;
  document.querySelectorAll('.section:not(.hidden) [id$="-list"]:not(#payroll-list), #att-form-list').forEach(el => {
    el.innerHTML = '<div class="sk-row"><div class="sk sk-av"></div><div class="sk-col"><div class="sk sk-l1"></div><div class="sk sk-l2"></div></div></div>'.repeat(4); });
};
window.getDb = () => db; window.esc = esc;
function applyDb(n) { db = n; Cloud.snapshot(db); persist(); const s = document.querySelector('.section:not(.hidden)'); if (s) nav(s.id, false); }
const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- NAVIGATION & UI UX ---
function nav(sectionId, push = true) {
    if (push && location.hash !== '#/' + sectionId) history.pushState(null, '', '#/' + sectionId);
    document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    
    // Active State for Bottom Nav
    document.querySelectorAll('.nav-item-mobile').forEach(el => el.classList.remove('text-indigo-400', 'text-white'));
    
    if(sectionId === 'dashboard') { renderDashboard(); highlightNav(0); }
    if(sectionId === 'attendance') { document.getElementById('att-date').value = new Date().toISOString().split('T')[0]; renderAttendanceForm(); highlightNav(1); }
    if(sectionId === 'bonus') { renderBonuses(); updateSelectOptions(); highlightNav(2); }
    if(sectionId === 'payroll') { highlightNav(3); }
    if(sectionId === 'menu_more') { highlightNav(4); }
    
    if(sectionId === 'employees') renderEmployees();
    if(sectionId === 'positions') renderPositions();
    if(sectionId === 'holidays') renderHolidays();
    if(sectionId === 'kasbon') { renderKasbon(); updateSelectOptions(); }
    if(sectionId === 'profile') loadProfile();
    
    document.querySelectorAll('.sidebar .nav-item').forEach(a => a.classList.toggle('on', a.getAttribute('onclick').includes("'" + sectionId + "'")));
window.scrollTo(0,0);
}

function highlightNav(index) {
    const navs = document.querySelectorAll('.nav-item-mobile');
    if(navs[index]) navs[index].classList.add('text-indigo-400');
}

function updateSelectOptions() {
    const activeEmps = db.employees.filter(e => (e.status || 'active') === 'active');
    const options = '<option value="">Pilih Karyawan</option>' + activeEmps.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
    if(document.getElementById('kasbon-emp')) document.getElementById('kasbon-emp').innerHTML = options;
    if(document.getElementById('bonus-emp')) document.getElementById('bonus-emp').innerHTML = options;
}

// --- ATTENDANCE ---
function switchAttTab(tab) {
    document.getElementById('att-input-panel').classList.toggle('hidden', tab !== 'input');
    document.getElementById('att-history-panel').classList.toggle('hidden', tab !== 'history');
    document.getElementById('btn-att-input').className = "flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all " + (tab === 'input' ? "bg-primary text-white shadow-lg shadow-indigo-500/30" : "text-gray-500 hover:bg-gray-100");
    document.getElementById('btn-att-history').className = "flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all " + (tab === 'history' ? "bg-primary text-white shadow-lg shadow-indigo-500/30" : "text-gray-500 hover:bg-gray-100");
    if(tab === 'input') renderAttendanceForm(); else renderAttendanceHistory();
}

function renderAttendanceForm() {
    const date = document.getElementById('att-date').value;
    const activeEmps = db.employees.filter(e => (e.status || 'active') === 'active');
    document.getElementById('att-form-list').innerHTML = activeEmps.map(emp => {
        const exist = db.attendance.find(a => a.empId === emp.id && a.date === date);
        const status = exist ? exist.status : 'hadir';
        
        // Color coding selection
        let bgClass = "bg-white";
        if(status === 'sakit') bgClass = "bg-blue-50 border-blue-200";
        if(status === 'izin') bgClass = "bg-yellow-50 border-yellow-200";
        if(status === 'alpha') bgClass = "bg-red-50 border-red-200";

        return `
        <div class="flex justify-between items-center p-3 rounded-xl border border-gray-100 ${bgClass} transition-colors">
            <div class="font-medium text-sm text-dark">${esc(emp.name)}</div>
            <select id="att-status-${emp.id}" onchange="this.parentElement.className='flex justify-between items-center p-3 rounded-xl border transition-colors ' + (this.value=='hadir'?'bg-white border-gray-100':(this.value=='sakit'?'bg-blue-50 border-blue-200':(this.value=='izin'?'bg-yellow-50 border-yellow-200':'bg-red-50 border-red-200')))" class="text-sm bg-transparent border-none font-medium text-gray-600 focus:ring-0 cursor-pointer">
                <option value="hadir" ${status==='hadir'?'selected':''}>Hadir</option>
                <option value="sakit" ${status==='sakit'?'selected':''}>Sakit</option>
                <option value="izin" ${status==='izin'?'selected':''}>Izin</option>
                <option value="alpha" ${status==='alpha'?'selected':''}>Alpha</option>
            </select>
        </div>`;
    }).join('');
}

function markAllPresent() {
    const activeEmps = db.employees.filter(e => (e.status || 'active') === 'active');
    activeEmps.forEach(emp => { if(document.getElementById(`att-status-${emp.id}`)) {
        const el = document.getElementById(`att-status-${emp.id}`);
        el.value = 'hadir';
        el.parentElement.className = 'flex justify-between items-center p-3 rounded-xl border border-gray-100 bg-white transition-colors';
    }});
}

function saveAttendance() {
    const date = document.getElementById('att-date').value;
    if(!date) return alert('Pilih tanggal');
    db.attendance = db.attendance.filter(a => a.date !== date);
    const activeEmps = db.employees.filter(e => (e.status || 'active') === 'active');
    activeEmps.forEach(emp => {
        const status = document.getElementById(`att-status-${emp.id}`).value;
        db.attendance.push({ id: generateId(), date, empId: emp.id, status });
    });
    save(); alert('Absensi Tersimpan!');
}

function renderAttendanceHistory() {
    let start = document.getElementById('hist-start').value;
    let end = document.getElementById('hist-end').value;
    if(!start) {
        const d = new Date();
        start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        document.getElementById('hist-start').value = start; document.getElementById('hist-end').value = end;
    }
    const filtered = db.attendance.filter(a => a.date >= start && a.date <= end).sort((a,b)=>b.date.localeCompare(a.date));
    document.getElementById('att-hist-list').innerHTML = filtered.map(a => {
        const emp = db.employees.find(e => e.id === a.empId) || {name:'?'};
        let statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">Hadir</span>`;
        if(a.status === 'sakit') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-600">Sakit</span>`;
        if(a.status === 'izin') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-600">Izin</span>`;
        if(a.status === 'alpha') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-600">Alpha</span>`;

        return `
        <div class="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div>
                <div class="text-[10px] text-gray-400 font-bold">${a.date}</div>
                <div class="font-medium text-sm text-dark">${esc(emp.name)}</div>
            </div>
            <div class="flex items-center gap-3">
                ${statusBadge}
                <button onclick="deleteItem('attendance','${a.id}')" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// --- DASHBOARD RENDER ---
function renderDashboard() {
    document.getElementById('header-date').innerText = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    if(document.getElementById('stat-total-emp')) document.getElementById('stat-total-emp').innerText = db.employees.filter(e => (e.status || 'active') === 'active').length;
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('stat-today-att')) document.getElementById('stat-today-att').innerText = db.attendance.filter(a => a.date === today && a.status === 'hadir').length;

    let start = document.getElementById('dash-start').value;
    let end = document.getElementById('dash-end').value;
    if(!start) {
        const d = new Date();
        start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        document.getElementById('dash-start').value = start; document.getElementById('dash-end').value = end;
    }
    
    const totalKasbon = db.kasbon.filter(k => k.date >= start && k.date <= end).reduce((sum, k) => sum + k.amount, 0);
    if(document.getElementById('stat-total-kasbon')) document.getElementById('stat-total-kasbon').innerText = formatRp(totalKasbon);
    const totalBonus = db.bonuses.filter(b => b.date >= start && b.date <= end).reduce((sum, b) => sum + b.amount, 0);
    if(document.getElementById('stat-total-bonus')) document.getElementById('stat-total-bonus').innerText = formatRp(totalBonus);
}

// --- EMPLOYEE MANAGEMENT (Card Style) ---
let empFilter = 'all';
function setEmpFilter(status) {
    empFilter = status;
    document.querySelectorAll('.emp-filter-btn').forEach(btn => {
        const active = btn.dataset.filter === status;
        btn.className = active
            ? 'emp-filter-btn px-4 py-1.5 rounded-full text-xs font-bold bg-dark text-white whitespace-nowrap'
            : 'emp-filter-btn px-4 py-1.5 rounded-full text-xs font-bold bg-white text-gray-500 border border-gray-200 whitespace-nowrap';
    });
    renderEmployees();
}

function openEmpModal(mode, id = null) {
    const modal = document.getElementById('modal-emp');
    modal.classList.remove('hidden');
    const posSelect = document.getElementById('emp-pos');
    posSelect.innerHTML = db.positions.length ? '<option value="">Pilih Jabatan</option>' + db.positions.map(p => `<option value="${p.id}">${esc(p.title)}</option>`).join('') : '<option value="">-- Buat Jabatan Dulu --</option>';

    if(mode === 'edit' && id) {
        const emp = db.employees.find(e => e.id === id);
        if(emp) {
            document.getElementById('modal-emp-title').innerText = "Edit Karyawan";
            document.getElementById('emp-id').value = emp.id;
            document.getElementById('emp-nik').value = emp.nik || '';
            document.getElementById('emp-name').value = emp.name || '';
            document.getElementById('emp-join').value = emp.join || '';
            document.getElementById('emp-gender').value = emp.gender || 'L';
            document.getElementById('emp-pos').value = emp.posId || '';
            document.getElementById('emp-status').value = emp.status || 'active';
            document.getElementById('emp-phone').value = emp.phone || '';
            const addrEl = document.getElementById('emp-addr');
            if(addrEl) addrEl.value = emp.addr || '';
            document.getElementById('emp-bank-name').value = emp.bankName || '';
            document.getElementById('emp-bank-acc').value = emp.bankAcc || '';
        }
    } else {
        document.getElementById('modal-emp-title').innerText = "Tambah Karyawan";
        document.getElementById('emp-id').value = '';
        document.querySelectorAll('#modal-emp input').forEach(i => i.value = '');
        document.getElementById('emp-join').value = new Date().toISOString().split('T')[0];
        document.getElementById('emp-gender').value = 'L';
        document.getElementById('emp-pos').value = '';
        document.getElementById('emp-status').value = 'active';
    }
}
function closeEmpModal() { document.getElementById('modal-emp').classList.add('hidden'); }

function saveEmployee() {
    const id = document.getElementById('emp-id').value;
    const addrEl = document.getElementById('emp-addr');
    const data = {
        id: id || generateId(),
        nik: document.getElementById('emp-nik').value.trim(),
        name: document.getElementById('emp-name').value.trim(),
        join: document.getElementById('emp-join').value,
        gender: document.getElementById('emp-gender').value,
        posId: document.getElementById('emp-pos').value,
        status: document.getElementById('emp-status').value,
        phone: document.getElementById('emp-phone').value.trim(),
        addr: addrEl ? addrEl.value.trim() : '',
        bankName: document.getElementById('emp-bank-name').value.trim(),
        bankAcc: document.getElementById('emp-bank-acc').value.trim()
    };
    if (!db.positions.length) return alert('Buat data Jabatan terlebih dahulu di menu Jabatan');
    if (!data.name || !data.posId || !data.join) return alert('Nama, Jabatan, dan Tgl Masuk wajib diisi');
    if(id) {
        const idx = db.employees.findIndex(e => e.id === id);
        if(idx !== -1) db.employees[idx] = { ...db.employees[idx], ...data };
    } else {
        db.employees.push(data);
    }
    save(); renderEmployees(); closeEmpModal();
}

function renderEmployees() {
    const search = (document.getElementById('emp-search').value || '').trim().toLowerCase();
    const filtered = db.employees.filter(e => {
        const status = e.status || 'active';
        if (empFilter !== 'all' && status !== empFilter) return false;
        if (!search) return true;
        return (e.name || '').toLowerCase().includes(search) || (e.nik || '').toLowerCase().includes(search);
    });

    const listEl = document.getElementById('emp-list');
    if (!filtered.length) {
        listEl.innerHTML = `<div class="col-span-full bg-white p-8 rounded-2xl border border-gray-100 text-center text-sm text-gray-400">${db.employees.length ? 'Karyawan tidak ditemukan.' : 'Belum ada data karyawan. Klik tombol Tambah untuk menambahkan.'}</div>`;
        updateSelectOptions();
        return;
    }

    listEl.innerHTML = filtered.map(e => {
        const pos = db.positions.find(p => p.id === e.posId) || { title: '?' };
        const isActive = (e.status || 'active') === 'active';
        const statusDot = isActive ? 'bg-green-500' : 'bg-red-500';
        const initial = (e.name || '?').charAt(0).toUpperCase();
        const sub = e.nik ? `${esc(pos.title)} · ${esc(e.nik)}` : esc(pos.title);
        
        return `
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition">
            <div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full -mr-4 -mt-4"></div>
            <div class="flex items-center gap-4 mb-3">
                <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-lg">${esc(initial)}</div>
                <div>
                    <h4 class="font-bold text-dark text-sm">${esc(e.name)}</h4>
                    <p class="text-xs text-gray-500">${sub}</p>
                </div>
            </div>
            <div class="flex justify-between items-center border-t border-gray-50 pt-3">
                <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full ${statusDot}"></div>
                    <span class="text-xs text-gray-400 font-medium">${isActive?'Aktif':'Non-Aktif'}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="viewEmployee('${e.id}')" class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100" title="Detail"><i class="fa-solid fa-eye text-xs"></i></button>
                    <button onclick="openEmpModal('edit', '${e.id}')" class="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center hover:bg-yellow-100" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="deleteItem('employees', '${e.id}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100" title="Hapus"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
    updateSelectOptions();
}

function viewEmployee(id) {
    const emp = db.employees.find(e => e.id === id); if(!emp) return;
    const pos = db.positions.find(p => p.id === emp.posId) || { title: '-', salary: 0, meal: 0 };
    const joinDate = emp.join ? new Date(emp.join) : null;
    let tenure = '-';
    if (joinDate && !isNaN(joinDate.getTime())) {
        const diff = Math.ceil(Math.abs(new Date() - joinDate) / (1000 * 60 * 60 * 24));
        tenure = diff > 365 ? `${Math.floor(diff/365)} tahun` : `${diff} hari`;
    }
    const isActive = (emp.status || 'active') === 'active';

    document.getElementById('detail-avatar').innerText = (emp.name || '?').charAt(0).toUpperCase();
    document.getElementById('detail-name').innerText = emp.name || '-';
    document.getElementById('detail-job').innerText = pos.title;
    const badge = document.getElementById('detail-status-badge');
    badge.innerText = isActive ? 'Aktif' : 'Non-Aktif';
    badge.className = isActive ? 'mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700' : 'mt-2 inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700';

    document.getElementById('detail-join').innerText = emp.join || '-';
    document.getElementById('detail-tenure').innerText = tenure;
    document.getElementById('detail-phone').innerText = emp.phone || '-';
    const detailAddr = document.getElementById('detail-addr');
    if (detailAddr) detailAddr.innerText = emp.addr || '-';
    document.getElementById('detail-bank').innerText = emp.bankName || '-';
    document.getElementById('detail-rek').innerText = emp.bankAcc || '-';
    document.getElementById('detail-salary').innerText = formatRp(pos.salary);
    document.getElementById('detail-meal').innerText = formatRp(pos.meal);
    document.getElementById('modal-emp-detail').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('modal-emp-detail').classList.add('hidden'); }

// --- PAYROLL & OTHERS (Standard Logic) ---
let payrollData = [];
function calculatePayroll() {
    const start = document.getElementById('pay-start').value;
    const end = document.getElementById('pay-end').value;
    if(!start || !end) return alert('Pilih rentang tanggal');
    const activeEmps = db.employees.filter(e => (e.status || 'active') === 'active');
    payrollData = activeEmps.map(emp => {
        const pos = db.positions.find(p => p.id === emp.posId) || { salary: 0, meal: 0, title: '' };
        const presentDates = db.attendance.filter(a => a.empId === emp.id && a.date >= start && a.date <= end && a.status === 'hadir').map(a => a.date);
        const paidHolidayDates = db.holidays.filter(h => h.date >= start && h.date <= end && h.type === 'paid').map(h => h.date);
        const uniquePaidDays = new Set([...presentDates, ...paidHolidayDates]);
        const totalPaidDays = uniquePaidDays.size;
        const empKasbon = db.kasbon.filter(k => k.empId === emp.id && k.date >= start && k.date <= end).reduce((sum, k) => sum + k.amount, 0);
        const empBonus = db.bonuses.filter(b => b.empId === emp.id && b.date >= start && b.date <= end).reduce((sum, b) => sum + b.amount, 0);
        const basicTotal = totalPaidDays * pos.salary;
        const mealTotal = totalPaidDays * pos.meal;
        const gross = basicTotal + mealTotal;
        const net = gross + empBonus - empKasbon;
        return { emp, pos, paidDays: totalPaidDays, gross, kasbon: empKasbon, bonus: empBonus, net, start, end };
    });
    renderPayrollTable();
}

function renderPayrollTable() {
    document.getElementById('payroll-result').classList.remove('hidden');
    document.getElementById('payroll-list').innerHTML = payrollData.map((d, index) => `
        <tr class="border-b hover:bg-gray-50"><td class="p-4 font-bold text-dark">${esc(d.emp.name)}<br><span class="text-xs font-normal text-gray-400">${esc(d.pos.title)}</span></td><td class="p-4 text-center font-bold text-gray-600">${d.paidDays}</td><td class="p-4 text-right text-green-600 font-bold text-xs">${formatRp(d.bonus)}</td><td class="p-4 text-right text-red-600 font-bold text-xs">${formatRp(d.kasbon)}</td><td class="p-4 text-right font-bold text-indigo-900">${formatRp(d.net)}</td><td class="p-4 text-center"><button onclick="printSlip(${index})" class="bg-dark text-white w-8 h-8 rounded-lg shadow-lg shadow-indigo-500/30 flex items-center justify-center mx-auto"><i class="fa-solid fa-print text-xs"></i></button></td></tr>
    `).join('');
}

// --- GENERIC CRUD ---
function addPosition() { const t=document.getElementById('pos-title').value, s=Number(document.getElementById('pos-salary').value), m=Number(document.getElementById('pos-meal').value); if(!t)return alert('Wajib'); db.positions.push({id:generateId(),title:t,salary:s,meal:m}); save(); renderPositions(); document.getElementById('pos-title').value=''; }
function renderPositions() { document.getElementById('pos-list').innerHTML = db.positions.map(p => `<div class="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm"><div class="font-bold text-dark">${esc(p.title)}</div><div class="text-xs text-gray-500 text-right">Gaji: ${formatRp(p.salary)}<br>Makan: ${formatRp(p.meal)}</div><button onclick="deleteItem('positions','${p.id}')" class="text-gray-300 hover:text-red-500 ml-4"><i class="fa-solid fa-trash"></i></button></div>`).join(''); }

function addBonus() { const i=document.getElementById('bonus-emp').value, d=document.getElementById('bonus-date').value, a=Number(document.getElementById('bonus-amount').value), n=document.getElementById('bonus-note').value; if(!i||!a)return alert('Lengkapi'); db.bonuses.push({id:generateId(),empId:i,date:d,amount:a,note:n}); save(); renderBonuses(); }
function renderBonuses() { document.getElementById('bonus-list').innerHTML = db.bonuses.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(b => { const e=db.employees.find(x=>x.id===b.empId)||{name:'?'}; return `<div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center"><div><div class="text-[10px] text-gray-400 font-bold">${b.date}</div><div class="font-medium text-sm text-dark">${esc(e.name)} <span class="text-xs text-green-500">(${esc(b.note)})</span></div></div><div class="flex items-center gap-3"><span class="font-bold text-green-600">${formatRp(b.amount)}</span><button onclick="deleteItem('bonuses','${b.id}')" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button></div></div>`; }).join(''); }

function addKasbon() { const i=document.getElementById('kasbon-emp').value, d=document.getElementById('kasbon-date').value, a=Number(document.getElementById('kasbon-amount').value), n=document.getElementById('kasbon-note').value; if(!i||!a)return alert('Lengkapi'); db.kasbon.push({id:generateId(),empId:i,date:d,amount:a,note:n}); save(); renderKasbon(); }
function renderKasbon() { document.getElementById('kasbon-list').innerHTML = db.kasbon.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(k => { const e=db.employees.find(x=>x.id===k.empId)||{name:'?'}; return `<div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center"><div><div class="text-[10px] text-gray-400 font-bold">${k.date}</div><div class="font-medium text-sm text-dark">${esc(e.name)} <span class="text-xs text-red-400">(${esc(k.note)})</span></div></div><div class="flex items-center gap-3"><span class="font-bold text-red-600">${formatRp(k.amount)}</span><button onclick="deleteItem('kasbon','${k.id}')" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button></div></div>`; }).join(''); }

function addHoliday() { const d=document.getElementById('hol-date').value, t=document.getElementById('hol-type').value; if(!d)return; db.holidays.push({id:generateId(),date:d,type:t}); save(); renderHolidays(); }
function renderHolidays() { document.getElementById('hol-list').innerHTML = db.holidays.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(h => `<div class="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm"><div><div class="font-bold text-dark">${h.date}</div><span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${h.type==='paid'?'bg-green-100 text-green-600':'bg-red-100 text-red-600'}">${h.type==='paid'?'Dibayar':'Libur'}</span></div><button onclick="deleteItem('holidays','${h.id}')" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button></div>`).join(''); }

function deleteItem(type, id) { if(confirm('Hapus?')) { db[type] = db[type].filter(i => i.id !== id); save(); nav(type === 'employees' ? 'employees' : (type === 'attendance' ? 'attendance' : (type === 'bonuses' ? 'bonus' : type))); if(type==='positions') renderPositions(); if(type==='employees') renderEmployees(); if(type==='kasbon') renderKasbon(); if(type==='bonuses') renderBonuses(); if(type==='holidays') renderHolidays(); if(type==='attendance') renderAttendanceHistory(); } }

function saveProfile() { db.profile = { name: document.getElementById('prof-name').value, owner: document.getElementById('prof-owner').value, address: document.getElementById('prof-addr').value, phone: document.getElementById('prof-phone').value }; save(); alert('Tersimpan'); }
function loadProfile() { document.getElementById('prof-name').value = db.profile.name; document.getElementById('prof-owner').value = db.profile.owner; document.getElementById('prof-addr').value = db.profile.address; document.getElementById('prof-phone').value = db.profile.phone; }
function downloadBackup() { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db)); a.download = "backup_payroll_" + new Date().toISOString().slice(0,10) + ".json"; a.click(); }
function restoreBackup(event) { const r = new FileReader(); r.onload = e => { try { db = Object.assign({positions:[],employees:[],holidays:[],kasbon:[],bonuses:[],attendance:[],_tomb:{}}, JSON.parse(e.target.result)); save(); alert("Restore Sukses"); location.reload(); } catch(err) { alert("File rusak"); } }; r.readAsText(event.target.files[0]); }

function printSlip(index) {
    const data = payrollData[index]; const p = db.profile; const dateNow = new Date().toLocaleString('id-ID');
    const html = `<div style="width: 58mm; padding: 10px; font-family: monospace; font-size: 12px; line-height: 1.2;"><div style="text-align:center; font-weight:bold; font-size: 14px; margin-bottom:5px;">${esc(p.name)}</div><div style="text-align:center; font-size:10px; margin-bottom:10px; border-bottom: 1px dashed black; padding-bottom: 5px;">${esc(p.address)}<br>${esc(p.phone)}</div><div style="margin: 10px 0; font-weight: bold;">SLIP GAJI<br>Karyawan: ${esc(data.emp.name)}<br>Periode: ${data.start} - ${data.end}</div><table style="width:100%; font-size:12px;"><tr><td>Gaji (${data.paidDays}x)</td><td style="text-align:right;">${formatRp(data.paidDays * data.pos.salary)}</td></tr><tr><td>Makan</td><td style="text-align:right;">${formatRp(data.paidDays * data.pos.meal)}</td></tr><tr><td>Bonus</td><td style="text-align:right;">${formatRp(data.bonus)}</td></tr><tr><td>Kasbon</td><td style="text-align:right;">-${formatRp(data.kasbon)}</td></tr></table><div style="border-top: 1px solid black; margin: 10px 0; padding-top: 5px; display:flex; justify-content:space-between; font-weight:bold; font-size: 14px;"><span>TOTAL</span><span>${formatRp(data.net)}</span></div><div style="text-align:center; font-size:10px; margin-top:20px;">${dateNow}</div><br></div>`;
    document.getElementById('print-area').innerHTML = html; setTimeout(() => { window.print(); }, 500);
}

function exportFullPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.text(`Laporan Gaji: ${db.profile.name}`, 14, 15); doc.setFontSize(10); doc.text(`Periode: ${document.getElementById('pay-start').value} s/d ${document.getElementById('pay-end').value}`, 14, 22);
    const rows = payrollData.map(d => [d.emp.name, d.pos.title, d.paidDays + " Hari", formatRp(d.gross), formatRp(d.bonus), formatRp(d.kasbon), formatRp(d.net)]);
    doc.autoTable({ head: [["Nama", "Jabatan", "Hari Kerja", "Gaji Bruto", "Bonus", "Kasbon", "Total Terima"]], body: rows, startY: 30 });
    doc.save(`Laporan_Gaji_${Date.now()}.pdf`);
}

// Init App
window.addEventListener('popstate', () => { const s = location.hash.slice(2); if (document.getElementById(s)) nav(s, false); });
const first = location.hash.slice(2);
nav(document.getElementById(first)?.classList.contains('section') ? first : 'dashboard', false);
Cloud.init();
