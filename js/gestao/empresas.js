Gestao.Empresas = {
    carregar: async function() {
        const { data, error } = await Gestao.supabase.from('empresas').select('*').order('nome');
        if (error) return console.warn("Erro empresas:", error);
        Gestao.dados.empresas = data || [];
        this.renderizar(Gestao.dados.empresas);
    },

    renderizar: function(lista) {
        const container = document.getElementById('lista-empresas');
        if (!lista.length) return container.innerHTML = '<tr><td colspan="6" class="text-center py-4">Vazio.</td></tr>';
        
        container.innerHTML = lista.map(e => {
            const json = JSON.stringify(e).replace(/"/g, '&quot;');
            const dataFmt = e.data_entrada ? e.data_entrada.split('-').reverse().join('/') : '-';
            return `<tr class="hover:bg-slate-50 border-b border-slate-50 text-xs">
                <td class="px-6 py-3 font-bold text-slate-600">#${e.id}</td>
                <td class="px-6 py-3 font-bold text-slate-800">${e.nome}</td>
                <td class="px-6 py-3 text-blue-600 font-mono">${e.subdominio || '-'}</td>
                <td class="px-6 py-3 text-center text-slate-500">${dataFmt}</td>
                <td class="px-6 py-3 text-slate-500 truncate max-w-xs" title="${e.observacao}">${e.observacao || '-'}</td>
                <td class="px-6 py-3 text-center"><button onclick="Gestao.Empresas.abrirModal(${json})" class="text-blue-600"><i class="fas fa-edit"></i></button></td>
            </tr>`;
        }).join('');
    },

    filtrar: function() {
        const term = document.getElementById('search-empresa').value.toLowerCase();
        const lista = Gestao.dados.empresas.filter(e => e.nome.toLowerCase().includes(term) || String(e.id).includes(term) || (e.subdominio && e.subdominio.includes(term)));
        this.renderizar(lista);
    },

    importar: async function(input) {
        if (!input.files[0] || !confirm("Importar Empresas?")) return;
        try {
            const res = await Importacao.lerArquivo(input);
            const upserts = [];
            
            res.dados.forEach(row => {
                // Mapeamento exato do seu CSV: "ID Empresa", "Nome ", "Subdominio", "Entrou para mesa", "OBS"
                const keys = Object.keys(row);
                // Função helper para achar chave ignorando case/espaços
                const findKey = (str) => keys.find(k => Importacao.normalizar(k).includes(str));

                const kId = findKey('id empresa') || findKey('id');
                const kNome = findKey('nome');
                const kSub = findKey('subdominio');
                const kData = findKey('entrou para mesa') || findKey('data');
                const kObs = findKey('obs');

                if (!kId || !kNome) return;
                const id = parseInt(row[kId]);
                const nome = row[kNome].toString().trim();
                if (!id || !nome) return;

                let data_entrada = null;
                if (kData && row[kData]) {
                    const d = row[kData].toString().trim();
                    // Aceita YYYY-MM-DD
                    if (d.match(/^\d{4}-\d{2}-\d{2}$/)) data_entrada = d;
                }

                upserts.push({ 
                    id, 
                    nome, 
                    subdominio: kSub ? row[kSub] : null, 
                    data_entrada, 
                    observacao: kObs ? row[kObs] : null 
                });
            });

            if (upserts.length) {
                const { error } = await Gestao.supabase.from('empresas').upsert(upserts);
                if (error) throw error;
                alert(`${upserts.length} empresas importadas.`);
                this.carregar();
            }
        } catch(e) { alert("Erro: " + e.message); }
        input.value = "";
    },

    abrirModal: function(e) {
        const m = document.getElementById('modal-empresa'); m.classList.remove('hidden'); m.classList.add('flex');
        const idInput = document.getElementById('form-empresa-id');
        if(e) {
            document.getElementById('modal-empresa-title').innerText = "Editar";
            idInput.value = e.id; idInput.disabled = true;
            document.getElementById('form-empresa-nome').value = e.nome;
            document.getElementById('form-empresa-sub').value = e.subdominio || '';
            document.getElementById('form-empresa-data').value = e.data_entrada || '';
            document.getElementById('form-empresa-obs').value = e.observacao || '';
            document.getElementById('btn-empresa-delete').classList.remove('hidden');
        } else {
            document.getElementById('modal-empresa-title').innerText = "Nova";
            idInput.value = ""; idInput.disabled = false;
            document.getElementById('form-empresa-nome').value = "";
            document.getElementById('form-empresa-sub').value = "";
            document.getElementById('form-empresa-obs').value = "";
            document.getElementById('btn-empresa-delete').classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-empresa-id').value;
        const nome = document.getElementById('form-empresa-nome').value;
        const sub = document.getElementById('form-empresa-sub').value;
        const data = document.getElementById('form-empresa-data').value;
        const obs = document.getElementById('form-empresa-obs').value;
        
        if(!id || !nome) return alert("ID e Nome obrigatórios");
        
        const payload = { id: parseInt(id), nome, subdominio: sub || null, data_entrada: data || null, observacao: obs || null };
        const { error } = await Gestao.supabase.from('empresas').upsert(payload);
        if(error) return alert("Erro: " + error.message);
        
        Gestao.fecharModais(); this.carregar();
    },

    excluir: async function() {
        if(!confirm("Excluir empresa?")) return;
        await Gestao.supabase.from('empresas').delete().eq('id', document.getElementById('form-empresa-id').value);
        Gestao.fecharModais(); this.carregar();
    }
};