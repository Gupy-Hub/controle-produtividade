Gestao.Empresas = {
    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('empresas').select('*').order('nome');
            const container = document.getElementById('lista-empresas');
            if (error) {
                console.warn("Tabela empresas pode não existir.", error);
                container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500 text-xs">Erro: Tabela 'empresas' não encontrada.</td></tr>`;
                return;
            }
            Gestao.dados.empresas = data || [];
            this.renderizar(Gestao.dados.empresas);
        } catch (err) { console.error(err); }
    },

    renderizar: function(lista) {
        const container = document.getElementById('lista-empresas');
        if (lista.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs">Nenhuma empresa cadastrada.</td></tr>`;
            return;
        }

        let html = '';
        lista.forEach(e => {
            const dataFmt = e.data_entrada ? e.data_entrada.split('-').reverse().join('/') : '-';
            const empresaJson = JSON.stringify(e).replace(/"/g, '&quot;');
            
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 group">
                <td class="px-6 py-4 font-bold text-slate-600">#${e.id}</td>
                <td class="px-6 py-4 font-bold text-slate-800">${e.nome}</td>
                <td class="px-6 py-4 text-blue-600 text-xs font-mono bg-blue-50/50 rounded px-2 w-fit">${e.subdominio || '-'}</td>
                <td class="px-6 py-4 text-center text-slate-500 text-xs">${dataFmt}</td>
                <td class="px-6 py-4 text-slate-500 text-xs max-w-xs truncate" title="${e.observacao || ''}">${e.observacao || '-'}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="Gestao.Empresas.abrirModal(${empresaJson})" class="text-slate-400 hover:text-blue-600 transition">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;
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

    // --- IMPORTAÇÃO DE EMPRESAS ---
    importar: async function(input) {
        const file = input.files[0];
        if (!file) return;
        if(!confirm("Importar EMPRESAS?\nIDs existentes serão atualizados.")) { input.value = ""; return; }

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
            } catch (err) { alert("Erro arquivo: " + err.message); }
            input.value = "";
        };
        reader.readAsArrayBuffer(file);
    },

    processarImportacao: async function(linhas) {
        const norm = t => t ? t.toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";
        const upserts = [];

        for (const row of linhas) {
            const keys = Object.keys(row);
            // Mapeamento baseado no seu CSV: ID Empresa, Nome, Subdominio, Entrou para mesa, OBS
            const kId = keys.find(k => ['id empresa', 'id'].includes(norm(k)));
            const kNome = keys.find(k => ['nome', 'nome da empresa', 'empresa'].includes(norm(k)));
            const kSub = keys.find(k => ['subdominio'].includes(norm(k)));
            const kData = keys.find(k => ['entrou para mesa', 'data', 'inicio'].includes(norm(k)));
            const kObs = keys.find(k => ['obs', 'observacao'].includes(norm(k)));

            if (!kId || !kNome) continue;

            const id = parseInt(row[kId]);
            const nome = row[kNome] ? row[kNome].toString().trim() : "";
            const sub = kSub && row[kSub] ? row[kSub].toString().trim() : null;
            const obs = kObs && row[kObs] ? row[kObs].toString().trim() : null;
            
            // Tratamento de data (Assume formato YYYY-MM-DD do Excel ou string)
            let dataEntrada = null;
            if (kData && row[kData]) {
                const d = row[kData].toString().trim();
                // Verifica se é válida
                if (d.match(/^\d{4}-\d{2}-\d{2}$/)) dataEntrada = d; 
                // Excel às vezes manda número serial para datas, o XLSX converte se usar option cellDates, 
                // mas aqui estamos lendo raw. Se vier string ISO, ok.
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
            if (upserts.length) {
                const { error } = await Gestao.supabase.from('empresas').upsert(upserts);
                if (error) throw error;
                alert(`Importação concluída: ${upserts.length} empresas processadas.`);
                this.carregar();
            } else {
                alert("Nenhuma empresa válida encontrada no arquivo.");
            }
        } catch (err) { alert("Erro BD: " + err.message); }
    },

    // --- MODAL ---
    abrirModal: function(empresa = null) {
        const m = document.getElementById('modal-empresa');
        m.classList.remove('hidden'); m.classList.add('flex');
        
        const btnDel = document.getElementById('btn-empresa-delete');
        const inputId = document.getElementById('form-empresa-id');

        if (empresa) {
            document.getElementById('modal-empresa-title').innerText = "Editar Empresa";
            inputId.value = empresa.id; inputId.disabled = true; inputId.classList.add('bg-slate-100');
            document.getElementById('form-empresa-nome').value = empresa.nome;
            document.getElementById('form-empresa-sub').value = empresa.subdominio || '';
            document.getElementById('form-empresa-data').value = empresa.data_entrada || '';
            document.getElementById('form-empresa-obs').value = empresa.observacao || '';
            btnDel.classList.remove('hidden');
        } else {
            document.getElementById('modal-empresa-title').innerText = "Nova Empresa";
            inputId.value = ""; inputId.disabled = false; inputId.classList.remove('bg-slate-100');
            document.getElementById('form-empresa-nome').value = "";
            document.getElementById('form-empresa-sub').value = "";
            document.getElementById('form-empresa-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('form-empresa-obs').value = "";
            btnDel.classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-empresa-id').value;
        const nome = document.getElementById('form-empresa-nome').value;
        const sub = document.getElementById('form-empresa-sub').value;
        const data = document.getElementById('form-empresa-data').value;
        const obs = document.getElementById('form-empresa-obs').value;
        
        if (!id || !nome) return alert("ID e Nome são obrigatórios.");

        try {
            const payload = {
                id: parseInt(id),
                nome: nome,
                subdominio: sub,
                data_entrada: data || null,
                observacao: obs
            };

            const { error } = await Gestao.supabase.from('empresas').upsert(payload);
            if (error) throw error;

            alert("Empresa salva com sucesso!");
            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        }
    },

    excluir: async function() {
        const id = document.getElementById('form-empresa-id').value;
        if (!confirm(`Tem certeza que deseja excluir a empresa ID ${id}?`)) return;

        try {
            const { error } = await Gestao.supabase.from('empresas').delete().eq('id', id);
            if (error) throw error;
            alert("Empresa excluída.");
            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    }
};