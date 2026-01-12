Gestao.Metas = {
    estado: {
        mes: new Date().getMonth() + 1, 
        ano: new Date().getFullYear(),
        lista: []
    },

    init: function() {
        this.atualizarLabelPeriodo();
        this.carregar();
    },

    mudarMes: function(delta) {
        let novoMes = this.estado.mes + delta;
        if (novoMes > 12) {
            novoMes = 1;
            this.estado.ano++;
        } else if (novoMes < 1) {
            novoMes = 12;
            this.estado.ano--;
        }
        this.estado.mes = novoMes;
        this.atualizarLabelPeriodo();
        this.carregar();
    },

    atualizarLabelPeriodo: function() {
        const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const label = document.getElementById('metas-periodo-label');
        if (label) label.innerText = `${nomesMeses[this.estado.mes - 1]} de ${this.estado.ano}`;
    },

    carregar: async function() {
        const tbody = document.getElementById('lista-metas');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></td></tr>';

        // 1. Busca Usuários Ativos
        const { data: usuarios, error: errUser } = await Sistema.supabase
            .from('usuarios')
            .select('*')
            .eq('ativo', true)
            .order('nome');

        if (errUser) { console.error(errUser); return; }

        // 2. Busca Metas do Mês
        const { data: metasExistentes, error: errMeta } = await Sistema.supabase
            .from('metas')
            .select('*')
            .eq('mes', this.estado.mes)
            .eq('ano', this.estado.ano);

        // 3. Mesclagem (Usuário + Metas)
        this.estado.lista = usuarios.map(u => {
            const meta = metasExistentes?.find(m => m.usuario_id === u.id);
            return {
                ...u,
                meta_prod: meta ? meta.meta_producao : null,
                meta_assert: meta ? meta.meta_assertividade : null
            };
        });

        this.renderizar();
    },

    renderizar: function() {
        const tbody = document.getElementById('lista-metas');
        const footer = document.getElementById('resumo-metas-footer');
        if (!tbody) return;

        let html = '';
        this.estado.lista.forEach(item => {
            const prodVal = item.meta_prod !== null ? item.meta_prod : '';
            const assertVal = item.meta_assert !== null ? item.meta_assert : '';
            
            const contratoClass = item.contrato === 'PJ' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition group">
                <td class="px-6 py-4 text-center">
                    <input type="checkbox" class="check-meta-item w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" value="${item.id}">
                </td>
                <td class="px-6 py-4 font-mono text-slate-400 text-xs">#${item.id}</td>
                <td class="px-6 py-4 font-bold text-slate-700">${item.nome}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-[10px] font-bold border ${contratoClass}">${item.contrato || 'ND'}</span>
                </td>
                
                <td class="px-4 py-3 text-center bg-blue-50/10 group-hover:bg-blue-50/30 transition border-x border-slate-100">
                    <div class="relative max-w-[120px] mx-auto">
                        <input type="number" id="prod-${item.id}" value="${prodVal}" placeholder="0"
                            class="w-full text-center border border-slate-300 rounded-lg py-1.5 text-sm font-bold text-blue-700 focus:border-blue-500 outline-none focus:ring-2 focus:ring-blue-100 transition">
                        <span class="absolute right-2 top-2 text-[10px] text-slate-300 font-bold select-none">qtd</span>
                    </div>
                </td>

                <td class="px-4 py-3 text-center bg-emerald-50/10 group-hover:bg-emerald-50/30 transition border-r border-slate-100">
                    <div class="relative max-w-[120px] mx-auto">
                        <input type="number" id="assert-${item.id}" value="${assertVal}" step="0.1" placeholder="0.0"
                            class="w-full text-center border border-slate-300 rounded-lg py-1.5 text-sm font-bold text-emerald-700 focus:border-emerald-500 outline-none focus:ring-2 focus:ring-emerald-100 transition">
                        <span class="absolute right-2 top-2 text-[10px] text-slate-300 font-bold select-none">%</span>
                    </div>
                </td>

                <td class="px-6 py-4 text-right">
                    <button class="text-xs text-blue-500 hover:underline opacity-50 hover:opacity-100">Ver</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if(footer) footer.innerText = `${this.estado.lista.length} assistentes ativos`;
    },

    toggleSelecionarTodos: function() {
        const master = document.getElementById('check-meta-todos');
        const checks = document.querySelectorAll('.check-meta-item');
        checks.forEach(c => c.checked = master.checked);
    },

    aplicarEmMassa: function() {
        const valProd = document.getElementById('input-massa-prod').value;
        const valAssert = document.getElementById('input-massa-assert').value;

        if (!valProd && !valAssert) return alert("Preencha ao menos um valor (Produção ou %) para aplicar.");

        const checks = document.querySelectorAll('.check-meta-item:checked');
        if (checks.length === 0) return alert("Selecione os assistentes na lista primeiro.");

        checks.forEach(chk => {
            const uid = chk.value;
            // Só sobrescreve se o input de massa tiver valor
            if (valProd) {
                const inp = document.getElementById(`prod-${uid}`);
                if(inp) inp.value = valProd;
            }
            if (valAssert) {
                const inp = document.getElementById(`assert-${uid}`);
                if(inp) inp.value = valAssert;
            }
        });
        
        alert(`Aplicado para ${checks.length} assistentes! Não esqueça de Salvar.`);
    },

    salvarTodas: async function() {
        const btn = document.querySelector('button[onclick="Gestao.Metas.salvarTodas()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        const upserts = [];
        
        this.estado.lista.forEach(item => {
            const valProd = document.getElementById(`prod-${item.id}`)?.value;
            const valAssert = document.getElementById(`assert-${item.id}`)?.value;

            // Se tiver qualquer dado preenchido, salva
            if ((valProd !== '' && valProd !== null) || (valAssert !== '' && valAssert !== null)) {
                upserts.push({
                    usuario_id: item.id,
                    usuario_nome: item.nome,
                    mes: this.estado.mes,
                    ano: this.estado.ano,
                    meta_producao: valProd ? parseInt(valProd) : 0,
                    meta_assertividade: valAssert ? parseFloat(valAssert) : 0
                });
            }
        });

        if (upserts.length === 0) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return alert("Nada para salvar.");
        }

        const { error } = await Sistema.supabase
            .from('metas')
            .upsert(upserts, { onConflict: 'usuario_id, mes, ano' });

        btn.innerHTML = originalText;
        btn.disabled = false;

        if (error) {
            console.error(error);
            alert("Erro ao salvar: " + error.message);
        } else {
            alert("Metas salvas com sucesso!");
            this.carregar(); 
        }
    }
};