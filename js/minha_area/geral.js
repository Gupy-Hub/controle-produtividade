/* ARQUIVO: js/minha_area/geral.js
   DESCRIÇÃO: Lógica da Aba "Dia a Dia" (Visão Geral)
   ATUALIZAÇÃO: Integrado com Seletor de Equipe
*/

MinhaArea.Geral = {
    chartVolume: null,
    
    carregar: async function() {
        console.log("📅 Dia a Dia: Carregando dados...");
        
        // O PULO DO GATO: Pega o ID do filtro, não apenas do logado
        const uid = MinhaArea.getUsuarioAlvo(); 
        if (!uid) return;

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        
        this.resetarKPIs();

        try {
            // 1. Busca Dados de Produção
            const { data: producao, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid) // Usa o ID dinâmico
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: true });

            if (error) throw error;

            // 2. Busca Dados de Metas (para comparar)
            const anoAtual = new Date(inicio).getFullYear();
            const { data: metas } = await Sistema.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .eq('ano', anoAtual);

            // 3. Processa e Renderiza
            this.calcularKPIs(producao, metas, inicio, fim);
            this.renderizarTabela(producao);

        } catch (err) {
            console.error("Erro Dia a Dia:", err);
            Sistema.toast("Erro ao carregar dados diários", "erro");
        }
    },

    calcularKPIs: function(dados, metasDb, inicioStr, fimStr) {
        let totalDocs = 0;
        let diasProdutivos = 0;
        let somaFator = 0;
        let totalMetas = 0;

        // Mapa de Metas por Mês
        const mapMetas = {};
        if (metasDb) {
            metasDb.forEach(m => mapMetas[m.mes] = m.meta);
        }

        dados.forEach(d => {
            const qtd = Number(d.quantidade || 0);
            const fator = Number(d.fator || 1); // Se não tiver fator, assume 1 (dia útil)
            
            if (qtd > 0) {
                totalDocs += qtd;
                diasProdutivos++;
            }
            somaFator += fator;

            // Calcula meta proporcional do dia
            const dataRef = new Date(d.data_referencia + 'T12:00:00');
            const mes = dataRef.getMonth() + 1;
            const metaMensal = mapMetas[mes] || 650; // Default 650 se não tiver meta
            
            // Meta do dia = MetaMensal / 22 (aprox) * Fator
            // Ou simplificado: Meta Diária Fixa * Fator
            const metaDia = Math.round((metaMensal / 22) * fator); 
            totalMetas += metaDia;
        });

        // Velocidade Média
        const velocidade = diasProdutivos > 0 ? Math.round(totalDocs / diasProdutivos) : 0;
        
        // Assertividade (Placeholder - ideal vir do banco de assertividade, mas aqui usamos simplificado ou deixamos --)
        // Se quiser puxar assertividade real aqui, precisaria de outra query. 
        // Por enquanto, vou manter o valor estático do HTML ou calcular se tivermos dados.
        // Vamos focar no volume que é o core dessa aba.

        // Atualiza DOM
        this.setTxt('kpi-total', totalDocs.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-acumulada', totalMetas.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', diasProdutivos);
        this.setTxt('kpi-dias-uteis', somaFator.toFixed(1)); // Soma dos fatores = dias úteis reais
        this.setTxt('kpi-media', velocidade);
        
        // Barras de Progresso
        const pctVolume = totalMetas > 0 ? (totalDocs / totalMetas) * 100 : 0;
        this.setBar('bar-volume', pctVolume, 'bg-blue-500');

        // Dias úteis vs Dias corridos (Exemplo)
        // const diasTotais = (new Date(fimStr) - new Date(inicioStr)) / (1000 * 60 * 60 * 24);
        // this.setBar('bar-dias', (diasProdutivos / diasTotais) * 100, 'bg-purple-500');
    },

    renderizarTabela: function(dados) {
        const tbody = document.getElementById('tabela-extrato');
        if (!tbody) return;

        tbody.innerHTML = '';
        document.getElementById('total-registros-footer').innerText = dados.length;

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-slate-400">Nenhum registro encontrado neste período.</td></tr>';
            return;
        }

        dados.forEach(d => {
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50 transition border-b border-slate-100";
            
            // Formata Data
            const dataFormatada = new Date(d.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR');
            
            // Cores condicionais
            const corProd = d.quantidade >= d.meta_dia ? 'text-emerald-600 font-bold' : 'text-slate-600';

            row.innerHTML = `
                <td class="px-3 py-2 font-bold text-slate-700">${dataFormatada}</td>
                <td class="px-2 py-2 text-center text-slate-500">${Number(d.fator).toFixed(1)}</td>
                <td class="px-2 py-2 text-center text-xs">${d.fifo || '-'}</td>
                <td class="px-2 py-2 text-center text-slate-500">${d.qtd_geral_total || '-'}</td>
                <td class="px-2 py-2 text-center text-slate-500">${d.qtd_geral_parcial || '-'}</td>
                <td class="px-2 py-2 text-center ${corProd} bg-blue-50/30 border-x border-slate-100">${d.quantidade}</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">${Math.round(d.meta_dia || 0)}</td>
                <td class="px-2 py-2 text-center font-bold text-xs">${this.calcPct(d.quantidade, d.meta_dia)}</td>
                <td class="px-2 py-2 text-center text-xs text-slate-400">98%</td>
                <td class="px-2 py-2 text-center font-bold text-xs text-slate-400">-</td>
                <td class="px-3 py-2 text-xs text-slate-400 italic truncate max-w-[150px]">${d.observacao || ''}</td>
            `;
            tbody.appendChild(row);
        });
    },

    resetarKPIs: function() {
        ['kpi-total', 'kpi-meta-acumulada', 'kpi-dias', 'kpi-dias-uteis', 'kpi-media'].forEach(id => this.setTxt(id, '--'));
        document.getElementById('bar-volume').style.width = '0%';
        document.getElementById('tabela-extrato').innerHTML = '<tr><td colspan="10" class="p-4 text-center"><i class="fas fa-spinner fa-spin text-blue-500"></i> Carregando...</td></tr>';
    },

    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    setBar: function(id, pct, color) { 
        const el = document.getElementById(id); 
        if(el) {
            el.style.width = `${Math.min(pct, 100)}%`;
            el.className = `h-full rounded-full ${color}`;
        }
    },
    calcPct: function(real, meta) {
        if (!meta || meta == 0) return '-';
        const pct = (real / meta) * 100;
        const cor = pct >= 100 ? 'text-emerald-500' : (pct >= 90 ? 'text-amber-500' : 'text-rose-500');
        return `<span class="${cor}">${pct.toFixed(0)}%</span>`;
    }
};