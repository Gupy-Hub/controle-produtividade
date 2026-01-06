Gestao.Empresas = {
    idsSelecionados: new Set(),

    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('empresas').select('*').order('nome');
            if (error) throw error;
            Gestao.dados.empresas = data || [];
            this.idsSelecionados.clear();
            this.filtrar(); // Aplica busca e renderiza
            this.atualizarBotaoExclusaoMassa();
        } catch (err) { console.error(err); }
    },

    filtrar: function() {
        const term = document.getElementById('search-empresa').value.toLowerCase();
        const filtered = Gestao.dados.empresas.filter(e => 
            e.nome.toLowerCase().includes(term) || 
            String(e.id).includes(term) ||
            (e.subdominio && e.subdominio.toLowerCase().includes(term))
        );
        this.renderizar(filtered);
    },

    renderizar: function(lista) {
        const container = document.getElementById('lista-empresas');
        if (lista.length === 0) return container.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 text-xs">Nenhuma empresa encontrada.</td></tr>`;

        let html = '';
        lista.forEach(e => {
            const dataFmt = e.data_entrada ? e.data_entrada.split('-').reverse().join('/') : '-';
            const empresaJson = JSON.stringify(e).replace(/"/g, '&quot;');
            const obsCurta = e.observacao && e.observacao.length > 30 ? e.observacao.substring(0, 30) + '...' : (e.observacao || '-');
            const isSelected = this.idsSelecionados.has(e.id);

            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 group text-xs ${isSelected ? 'bg-blue-50' : ''}">
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" onchange="Gestao.Empresas.toggleSelecao(${e.id})" ${isSelected ? 'checked' : ''} class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
                </td>
                <td class="px-6 py-3 font-bold text-slate-600">#${e.id}</td>
                <td class="px-6 py-3 font-bold text-slate-800 text-sm">${e.nome}</td>
                <td class="px-6 py-3 text-blue-600 font-mono bg-blue-50/30 rounded px-2 w-fit">${e.subdominio || '-'}</td>
                <td class="px-6 py-3 text-center text-slate-500">${dataFmt}</td>
                <td class="px-6 py-3 text-slate-500" title="${e.observacao || ''}">${obsCurta}</td>
                <td class="px-6 py-3 text-center flex gap-1 justify-center">
                    <button onclick="Gestao.Empresas.excluirIndividual(${e.id})" class="text-red-400 hover:text-red-600 p-2 rounded hover:bg-red-50"><i class="fas fa-trash"></i></button>
                    <button onclick="Gestao.Empresas.abrirModal(${empresaJson})" class="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-white border border-transparent hover:border-slate-100"><i class="fas fa-edit"></i></button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;
    },

    // --- SELEÇÃO ---
    toggleSelecao: function(id) {
        if (this.idsSelecionados.has(id)) this.idsSelecionados.delete(id);
        else this.idsSelecionados.add(id);
        this.filtrar(); 
        this.atualizarBotaoExclusaoMassa();
    },

    toggleSelecionarTodos: function(checkbox) {
        const term = document.getElementById('search-empresa').value.toLowerCase();
        const listaVisivel = Gestao.dados.empresas.filter(e => e.nome.toLowerCase().includes(term));

        if (checkbox.checked) {
            listaVisivel.forEach(e => this.idsSelecionados.add(e.id));
        } else {
            listaVisivel.forEach(e => this.idsSelecionados.delete(e.id));
        }
        this.filtrar();
        this.atualizarBotaoExclusaoMassa();
    },

    atualizarBotaoExclusaoMassa: function() {
        const btn = document.getElementById('btn-delete-mass-empresa');
        const countSpan = document.getElementById('count-sel-empresa');
        const count = this.idsSelecionados.size;
        
        countSpan.innerText = count;
        if (count > 0) {
            btn.classList.remove('hidden'); btn.classList.add('flex');
        } else {
            btn.classList.add('hidden'); btn.classList.remove('flex');
        }
    },

    excluirMassa: async function() {
        const count = this.idsSelecionados.size;
        if (!confirm(`ATENÇÃO: Deseja EXCLUIR ${count} empresas selecionadas?`)) return;

        try {
            const ids = Array.from(this.idsSelecionados);
            const { error } = await Gestao.supabase.from('empresas').delete().in('id', ids);
            if (error) throw error;
            alert("Exclusão realizada.");
            this.carregar();
        } catch (err) { alert("Erro ao excluir: " + err.message); }
    },

    excluirIndividual: async function(id) {
        if (!confirm(`Excluir empresa #${id}?`)) return;
        try {
            const { error } = await Gestao.supabase.from('empresas').delete().eq('id', id);
            if (error) throw error;
            this.carregar();
        } catch (err) { alert("Erro: " + err.message); }
    },

    // --- IMPORTAÇÃO ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;

        // VALIDAÇÃO DE NOME
        if (!file.name.toLowerCase().startsWith('empresas')) {
            alert("⚠️ Arquivo inválido!\nO nome do arquivo deve começar com 'Empresas'.");
            input.value = ""; return;
        }

        if(!confirm("Deseja importar EMPRESAS? (IDs existentes serão atualizados)")) { input.value = ""; return; }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                let workbook;
                try { workbook = XLSX.read(data, { type: 'array' }); } 
                catch { const dec = new TextDecoder('iso-8859-1'); workbook = XLSX.read(dec.decode(data), { type: 'string', raw: true }); }
                
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);
                await this.processarImportacao(json);
            } catch (err) { alert("Erro ao ler arquivo: " + err.message); }
            input.value = "";
        };
        reader.readAsArrayBuffer(file);
    },

    processarImportacao: async function(linhas) {
        const norm = t => t ? t.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
        const upserts = [];

        for (const row of linhas) {
            const keys = Object.keys(row);
            const kId = keys.find(k => ['id empresa', 'id', 'cod'].includes(norm(k)));
            const kNome = keys.find(k => ['nome', 'nome da empresa', 'empresa'].includes(norm(k)));
            const kSub = keys.find(k => ['subdominio', 'dominio'].includes(norm(k)));
            const kData = keys.find(k => ['entrou para mesa', 'data', 'inicio', 'data entrada'].includes(norm(k)));
            const kObs = keys.find(k => ['obs', 'observacao'].includes(norm(k)));

            if (!kId || !kNome) continue;

            const id = parseInt(row[kId]);
            const nome = row[kNome] ? row[kNome].toString().trim() : "";
            const sub = kSub && row[kSub] ? row[kSub].toString().trim() : null;
            const obs = kObs && row[kObs] ? row[kObs].toString().trim() : null;
            
            let dataEntrada = null;
            if (kData && row[kData]) {
                let d = row[kData].toString().trim();
                if (d.match(/^\d{4}-\d{2}-\d{2}$/)) dataEntrada = d; 
                else if (d.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                    const parts = d.split('/');
                    dataEntrada = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            if (!id || !nome) continue;

            upserts.push({
                id: id,
                nome: nome,
                subdominio: sub,
                data_entrada: dataEntrada,
                observacao: obs
            });
        }

        try {
            if (upserts.length > 0) {
                const { error } = await Gestao.supabase.from('empresas').upsert(upserts);
                if (error) throw error;
                alert(`✅ Importação concluída: ${upserts.length} empresas.`);
                this.carregar();
            } else {
                alert("Nenhuma empresa válida encontrada.");
            }
        } catch (err) { alert("Erro BD: " + err.message); }
    },

    // Modal
    abrirModal: function(e) {
        const m = document.getElementById('modal-empresa'); m.classList.remove('hidden'); m.classList.add('flex');
        const idInput = document.getElementById('form-empresa-id');
        if(e) {
            document.getElementById('modal-empresa-title').innerText = "Editar Empresa";
            idInput.value = e.id; idInput.disabled = true;
            document.getElementById('form-empresa-nome').value = e.nome;
            document.getElementById('form-empresa-sub').value = e.subdominio || '';
            document.getElementById('form-empresa-data').value = e.data_entrada || '';
            document.getElementById('form-empresa-obs').value = e.observacao || '';
            document.getElementById('btn-empresa-delete').classList.remove('hidden');
        } else {
            document.getElementById('modal-empresa-title').innerText = "Nova Empresa";
            idInput.value = ""; idInput.disabled = false;
            document.getElementById('form-empresa-nome').value = "";
            document.getElementById('form-empresa-sub').value = "";
            document.getElementById('form-empresa-data').value = new Date().toISOString().substring(0, 10);
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
        
        if (!id || !nome) return alert("ID e Nome obrigatórios");

        try {
            const payload = { id: parseInt(id), nome, subdominio: sub || null, data_entrada: data || null, observacao: obs || null };
            const { error } = await Gestao.supabase.from('empresas').upsert(payload);
            if (error) throw error;
            Gestao.fecharModais(); this.carregar();
        } catch (err) { alert("Erro: " + err.message); }
    },

    excluir: async function() {
        if (!confirm("Excluir esta empresa?")) return;
        try {
            const { error } = await Gestao.supabase.from('empresas').delete().eq('id', document.getElementById('form-empresa-id').value);
            if (error) throw error;
            Gestao.fecharModais(); this.carregar();
        } catch (err) { alert("Erro: " + err.message); }
    }
};