/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Lógica da Aba "Dia a Dia"
   ATUALIZAÇÃO: Usa getUsuarioAlvo() para respeitar o filtro
*/

MinhaArea.Geral = {
    carregar: async function() {
        console.log("📅 Dia a Dia: Carregando...");
        
        // USA O ID DO FILTRO (se houver), NÃO SÓ O DO LOGIN
        const uid = MinhaArea.getUsuarioAlvo(); 
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        this.resetarKPIs();

        try {
            // Busca Produção
            const { data: producao, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid) // ID Dinâmico
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;

            // Busca Metas
            const anoAtual = new Date(inicio).getFullYear();
            const { data: metas } = await Sistema.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .eq('ano', anoAtual);

            this.calcularKPIs(producao, metas);
            this.renderizarTabela(producao);

        } catch (err) {
            console.error("Erro Geral:", err);
            // Sistema.toast("Erro ao carregar dados", "erro");
        }
    },

    calcularKPIs: function(dados, metasDb) {
        let totalDocs = 0;
        let diasProdutivos = 0;
        let somaFator = 0;
        let totalMetas = 0;

        const mapMetas = {};
        if (metasDb) metasDb.forEach(m => mapMetas[m.mes] = m.meta);

        dados.forEach(d => {
            const qtd = Number(d.quantidade || 0);
            const fator = Number(d.fator || 1);
            
            if (qtd > 0) {
                totalDocs += qtd;
                diasProdutivos++;
            }
            somaFator += fator;

            const dataRef = new Date(d.data_referencia + 'T12:00:00');
            const mes = dataRef.getMonth() + 1;
            const metaMensal = mapMetas[mes] || 650;
            const metaDia = Math.round((metaMensal / 22) * fator); 
            totalMetas += metaDia;
        });

        const velocidade = diasProdutivos > 0 ? Math.round(totalDocs / diasProdutivos) : 0;
        
        this.setTxt('kpi-total', totalDocs.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-acumulada', totalMetas.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', diasProdutivos);
        this.setTxt('kpi-dias-uteis', somaFator.toFixed(1));
        this.setTxt('kpi-media', velocidade);
        
        const pctVolume = totalMetas > 0 ? (totalDocs / totalMetas) * 100 : 0;
        this.setBar('bar-volume', pctVolume, pctVolume >= 100 ? 'bg-emerald-500' : 'bg-blue-500');
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('tabela-extrato');
        if (!tbody) return;

        tbody.innerHTML = '';
        document.getElementById('total-registros-footer').innerText = dados.length;

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-slate-400 font-light">Nenhum registro encontrado neste período.</td></tr>';
            return;
        }

        dados.forEach(d => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition border-b border-slate-100 group";
            
            const dataFormatada = new Date(d.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR');
            const corProd = d.quantidade >= d.meta_dia ? 'text-emerald-600 font-bold' : 'text-slate-600';
            
            // Tratamento de Observação (Tooltip se for longa)
            const obs = d.observacao || '';
            const obsShort = obs.length > 20 ? obs.substring(0, 20) + '...' : obs;

            row.innerHTML = `
                <td class="px-3 py-2 font-bold text-slate-700">${dataFormatada}</td>
                <td class="px-2 py-2 text-center text-slate-500">${Number(d.fator).toFixed(1)}</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">${d.fifo || '-'}</td>
                <td class="px-2 py-2 text-center text-slate-400 text-xs">${d.qtd_geral_total || '-'}</td>
                <td class="px-2 py-2 text-center text-slate-400 text-xs">${d.qtd_geral_parcial || '-'}</td>
                <td class="px-2 py-2 text-center ${corProd} bg-blue-50/30 border-x border-slate-100">${d.quantidade}</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">${Math.round(d.meta_dia || 0)}</td>
                <td class="px-2 py-2 text-center font-bold text-xs">${this.calcPct(d.quantidade, d.meta_dia)}</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">98%</td>
                <td class="px-2 py-2 text-center font-bold text-xs text-slate-400">-</td>
                <td class="px-3 py-2 text-xs text-slate-400 italic" title="${obs}">${obsShort}</td>
            `;
            tbody.appendChild(row);
        });
    },

    resetarKPIs: function() {
        ['kpi-total', 'kpi-meta-acumulada', 'kpi-dias', 'kpi-dias-uteis', 'kpi-media'].forEach(id => this.setTxt(id, '--'));
        document.getElementById('bar-volume').style.width = '0%';
        document.getElementById('tabela-extrato').innerHTML = '<tr><td colspan="11" class="p-4 text-center"><i class="fas fa-spinner fa-spin text-blue-500"></i> Carregando...</td></tr>';
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, color) { 
        const el = document.getElementById(id); 
        if(el) {
            el.style.width = `${Math.min(pct, 100)}%`;
            el.className = `h-full rounded-full transition-all duration-1000 ${color}`;
        }
    },
    calcPct: function(real, meta) {
        if (!meta || meta == 0) return '-';
        const pct = (real / meta) * 100;
        const cor = pct >= 100 ? 'text-emerald-500' : (pct >= 90 ? 'text-amber-500' : 'text-rose-500');
        return `<span class="${cor}">${pct.toFixed(0)}%</span>`;
    }
};