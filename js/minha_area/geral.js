MinhaArea.Geral = {
    carregar: async function() {
        const usuarioId = MinhaArea.getUsuarioAlvo();
        const corpoTabela = document.getElementById('tabela-extrato');
        
        if (!usuarioId) {
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400 bg-slate-50/50"><i class="fas fa-user-friends text-4xl mb-3 text-blue-200"></i><p class="font-bold text-slate-500">Selecione uma colaboradora no topo</p></td></tr>';
            this.zerarKPIs();
            return;
        }

        const { inicio, fim } = MinhaArea.getDatasFiltro();
        corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-20 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl text-blue-400"></i></td></tr>';

        try {
            // Busca completa garantindo o campo justificativa
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*') 
                .eq('usuario_id', usuarioId)
                .gte('data_referencia', inicio)
                .lte('data_referencia', fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // Busca Meta Diária
            const [anoStr, mesStr] = inicio.split('-');
            const { data: metaData } = await Sistema.supabase
                .from('metas')
                .select('meta')
                .eq('usuario_id', usuarioId)
                .eq('mes', parseInt(mesStr))
                .eq('ano', parseInt(anoStr))
                .maybeSingle();

            const metaDiariaBase = metaData ? metaData.meta : 650;

            let totalProducao = 0, totalMetaAcumulada = 0, diasAtivos = 0;
            corpoTabela.innerHTML = '';

            data.forEach(item => {
                const quantidade = Number(item.quantidade || 0);
                const fator = Number(item.fator || 0);
                const metaDia = Math.round(metaDiariaBase * fator);
                
                totalProducao += quantidade;
                totalMetaAcumulada += metaDia;
                if(fator > 0) diasAtivos++;

                const percentual = metaDia > 0 ? (quantidade / metaDia) * 100 : 0;
                const corPercentual = percentual >= 100 ? 'text-emerald-600' : (percentual >= 80 ? 'text-amber-600' : 'text-rose-600');
                const dataFormatada = item.data_referencia.split('-').reverse().join('/');

                // Injeção da linha com a coluna de justificativa
                corpoTabela.innerHTML += `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-200 text-xs">
                        <td class="px-3 py-2 font-bold text-slate-700">${dataFormatada}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${fator}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.fifo || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_total || 0}</td>
                        <td class="px-2 py-2 text-center text-slate-400">${item.gradual_parcial || 0}</td>
                        <td class="px-2 py-2 text-center font-black text-blue-700 bg-blue-50/30">${quantidade}</td>
                        <td class="px-2 py-2 text-center text-slate-500">${metaDia}</td>
                        <td class="px-2 py-2 text-center font-bold ${corPercentual}">${percentual.toFixed(2)}%</td>
                        <td class="px-3 py-2 text-slate-600 italic">
                            ${item.justificativa || '<span class="text-slate-300">-</span>'}
                        </td>
                    </tr>`;
            });

            // Atualização dos KPIs nos Cards HUD
            const atingimentoGeral = totalMetaAcumulada > 0 ? (totalProducao / totalMetaAcumulada) * 100 : 0;
            this.setTxt('kpi-total', totalProducao.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-acumulada', totalMetaAcumulada.toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', atingimentoGeral.toFixed(2) + '%');
            this.setTxt('kpi-dias', diasAtivos);
            this.setTxt('kpi-media', diasAtivos > 0 ? Math.round(totalProducao / diasAtivos) : 0);
            this.setTxt('kpi-meta-dia', metaDiariaBase);
            this.setTxt('kpi-dias-uteis', this.calcularDiasUteisMes(inicio, fim));

            const barraProgresso = document.getElementById('bar-progress');
            if(barraProgresso) barraProgresso.style.width = `${Math.min(atingimentoGeral, 100)}%`;

        } catch (err) {
            console.error("Erro ao carregar Minha Área:", err);
            corpoTabela.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-rose-500">Erro na ligação ao servidor.</td></tr>';
        }
    },

    setTxt: function(id, valor) { 
        const elemento = document.getElementById(id); 
        if(elemento) elemento.innerText = valor; 
    },
    
    calcularDiasUteisMes: function(inicio, fim) {
        let contador = 0;
        const atual = new Date(inicio + 'T12:00:00');
        const fimData = new Date(fim + 'T12:00:00');
        while (atual <= fimData) {
            if (atual.getDay() !== 0 && atual.getDay() !== 6) contador++;
            atual.setDate(atual.getDate() + 1);
        }
        return contador;
    },

    zerarKPIs: function() {
        ['kpi-total','kpi-meta-acumulada','kpi-pct','kpi-dias','kpi-dias-uteis','kpi-media','kpi-meta-dia'].forEach(id => this.setTxt(id, '--'));
        const barra = document.getElementById('bar-progress'); 
        if(barra) barra.style.width = '0%';
    }
};